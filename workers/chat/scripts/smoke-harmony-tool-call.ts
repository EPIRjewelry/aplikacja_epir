/**
 * workers/chat/scripts/smoke-harmony-tool-call.ts
 *
 * Smoke test online dla migracji na format Harmony (`groq/openai/gpt-oss-120b`).
 *
 * Scenariusz biznesowy: klient pyta o produkt → backend zmusza model do wywołania
 * narzędzia (`search_catalog`) → model emituje finalną odpowiedź tekstową.
 *
 * Po stronie infrastruktury sprawdzamy:
 *   • HTTP 200 z Workera (nie 400 ze strony Groq — regresja na incydent sierpień 2025,
 *     gdzie `response_format: json_schema` + `tools` powodował 400 na GPT-OSS),
 *   • obecność SSE `event: tool_call` z `name === expected_tool`,
 *   • niepusty finalny `delta` po wywołaniu narzędzia,
 *   • `event: done` z `finish_reason` w {`stop`, `tool_calls`} (nie `length` / `content_filter`),
 *   • brak markup leak w treści (`tool_calls:[` / `<|...|>`),
 *   • obecność metryk `event: usage` (telemetria, nie blokuje wyniku).
 *
 * Użycie:
 *   tsx workers/chat/scripts/smoke-harmony-tool-call.ts \
 *     --endpoint https://asystent.epirbizuteria.pl \
 *     --operator-secret $EPIR_OPERATOR_PANEL_SECRET \
 *     --message "Pokaż obrączki ze srebra do 1500 zł." \
 *     --expect-tool search_catalog \
 *     --out docs/benchmarks/$(date +%F)-harmony-smoke.md
 *
 * Exit code 0 = wszystkie asercje zielone. Każda nieudana asercja → exit 1 + dump
 * w konsoli i raport markdown.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Typy i CLI
// ---------------------------------------------------------------------------

type CliOptions = {
  endpoint: string;
  operatorSecret: string;
  message: string;
  expectedTool: string;
  variant: string;
  sessionId: string;
  channel: string;
  brand: string;
  out: string;
  /** Twardy timeout całego strumienia (ms). */
  timeoutMs: number;
};

type Outcome = {
  /** Czy wszystkie obowiązkowe asercje przeszły. */
  pass: boolean;
  http_status: number;
  duration_ms_total: number;
  first_byte_ms: number | null;
  stream_total_ms: number | null;
  tool_calls_count: number;
  tool_call_names: string[];
  final_text_length: number;
  final_text_preview: string;
  finish_reason: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cached_tokens: number | null;
  reasoning_tokens: number | null;
  /** Trafiło `tool_calls:[` lub `<|...|>` w finalnym tekście. */
  tool_markup_leak: boolean;
  /** Treść `event: error` z SSE, jeśli wystąpiła. */
  stream_error: string | null;
  /** Lista zaobserwowanych zdarzeń SSE (`session`, `tool_call`, `status`, `usage`, `done`, `error`). */
  events_seen: string[];
  /** Lista listy asercji, które FAILed (puste = OK). */
  failures: string[];
};

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : 'true';
    args.set(key, value);
  }

  const endpoint = args.get('endpoint') ?? process.env.SMOKE_ENDPOINT ?? '';
  const operatorSecret =
    args.get('operator-secret') ?? process.env.EPIR_OPERATOR_PANEL_SECRET ?? '';
  const message = args.get('message') ?? 'Pokaż obrączki ze srebra do 1500 zł.';
  const expectedTool = args.get('expect-tool') ?? 'search_catalog';
  const variant = args.get('variant') ?? 'default';
  const sessionId = args.get('session-id') ?? `smoke-harmony-${Date.now()}`;
  const channel = args.get('channel') ?? 'operator';
  const brand = args.get('brand') ?? 'EPIR';
  const out =
    args.get('out') ?? `docs/benchmarks/${new Date().toISOString().slice(0, 10)}-harmony-smoke.md`;
  const timeoutMs = Number(args.get('timeout-ms') ?? '60000');

  if (!endpoint) {
    throw new Error(
      '--endpoint is required (e.g. https://asystent.epirbizuteria.pl). Set SMOKE_ENDPOINT env or pass --endpoint.',
    );
  }
  if (!operatorSecret) {
    throw new Error(
      '--operator-secret or EPIR_OPERATOR_PANEL_SECRET env is required (operator panel Bearer token).',
    );
  }
  return {
    endpoint,
    operatorSecret,
    message,
    expectedTool,
    variant,
    sessionId,
    channel,
    brand,
    out,
    timeoutMs,
  };
}

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

type SseEvent = { name: string; data: string };

/**
 * Splituje surowy strumień (`\r?\n\n` separator) na pojedyncze zdarzenia SSE.
 * Każde zdarzenie ma `event:` (domyślnie `message`) i jedną lub więcej linii `data:`.
 * Zwraca `{ events, remainder }` — remainder zostaje w buforze do następnego chunka.
 */
function splitSseBuffer(buffer: string): { events: SseEvent[]; remainder: string } {
  const events: SseEvent[] = [];
  let remainder = buffer;

  while (true) {
    const sepIdx = remainder.indexOf('\n\n');
    if (sepIdx === -1) break;
    const rawEvent = remainder.slice(0, sepIdx);
    remainder = remainder.slice(sepIdx + 2);

    let name = 'message';
    const dataLines: string[] = [];
    for (const line of rawEvent.split(/\r?\n/)) {
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (dataLines.length === 0) continue;
    events.push({ name, data: dataLines.join('\n') });
  }

  return { events, remainder };
}

// ---------------------------------------------------------------------------
// Smoke run
// ---------------------------------------------------------------------------

const MARKUP_LEAK_RE = /(\btool_calls\s*:\s*\[)|(<\|[^>]+\|>)/i;

async function runSmoke(opts: CliOptions): Promise<Outcome> {
  const url = `${opts.endpoint.replace(/\/$/, '')}/chat`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.operatorSecret}`,
    'X-Epir-Model-Variant': opts.variant,
  };
  const body = {
    message: opts.message,
    session_id: opts.sessionId,
    channel: opts.channel,
    brand: opts.brand,
  };

  const outcome: Outcome = {
    pass: false,
    http_status: 0,
    duration_ms_total: 0,
    first_byte_ms: null,
    stream_total_ms: null,
    tool_calls_count: 0,
    tool_call_names: [],
    final_text_length: 0,
    final_text_preview: '',
    finish_reason: null,
    prompt_tokens: null,
    completion_tokens: null,
    cached_tokens: null,
    reasoning_tokens: null,
    tool_markup_leak: false,
    stream_error: null,
    events_seen: [],
    failures: [],
  };

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), opts.timeoutMs);

  const t0 = Date.now();
  let firstByteAt: number | null = null;
  let finalTextBuffer = '';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    outcome.http_status = response.status;

    if (!response.ok || !response.body) {
      const errBody = await response.text().catch(() => '');
      outcome.failures.push(
        `HTTP ${response.status} (expected 200). Response body: ${errBody.slice(0, 600)}`,
      );
      if (/json_schema/i.test(errBody)) {
        outcome.failures.push(
          'Gateway zwrócił błąd o `json_schema` — regresja na incydent sierpień 2025.',
        );
      }
      return finalize(outcome, t0);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (firstByteAt === null) firstByteAt = Date.now();
      buffer += decoder.decode(value, { stream: true });

      const { events, remainder } = splitSseBuffer(buffer);
      buffer = remainder;

      for (const evt of events) {
        outcome.events_seen.push(evt.name);
        handleSseEvent(evt, outcome, finalTextBuffer, (text) => {
          finalTextBuffer = text;
        });
      }
    }

    // Pozostałe dane w buforze po zamknięciu strumienia.
    if (buffer.trim()) {
      const { events } = splitSseBuffer(buffer + '\n\n');
      for (const evt of events) {
        outcome.events_seen.push(evt.name);
        handleSseEvent(evt, outcome, finalTextBuffer, (text) => {
          finalTextBuffer = text;
        });
      }
    }

    outcome.final_text_length = finalTextBuffer.length;
    outcome.final_text_preview = finalTextBuffer.slice(0, 200);
    outcome.tool_markup_leak = MARKUP_LEAK_RE.test(finalTextBuffer);
    outcome.stream_total_ms = Date.now() - t0;
    if (firstByteAt !== null) outcome.first_byte_ms = firstByteAt - t0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    outcome.failures.push(`Fetch/stream error: ${msg}`);
  } finally {
    clearTimeout(timeoutHandle);
  }

  // --- Asercje obowiązkowe ---
  if (outcome.tool_call_names.length === 0) {
    outcome.failures.push(
      `Brak zdarzenia SSE \`tool_call\` — model nie wywołał żadnego narzędzia (oczekiwane: ${opts.expectedTool}).`,
    );
  } else if (!outcome.tool_call_names.includes(opts.expectedTool)) {
    outcome.failures.push(
      `Brak oczekiwanego narzędzia \`${opts.expectedTool}\` w wywołanych. Zaobserwowane: ${outcome.tool_call_names.join(', ')}.`,
    );
  }

  if (outcome.final_text_length === 0) {
    outcome.failures.push('Pusty finalny tekst — model nie wygenerował odpowiedzi po wynikach narzędzia.');
  }

  if (
    outcome.finish_reason !== null &&
    outcome.finish_reason !== 'stop' &&
    outcome.finish_reason !== 'tool_calls'
  ) {
    outcome.failures.push(
      `Nieoczekiwany finish_reason="${outcome.finish_reason}" (oczekiwane: stop|tool_calls).`,
    );
  }

  if (outcome.tool_markup_leak) {
    outcome.failures.push(
      'Wykryto markup leak w finalnym tekście (`tool_calls:[` lub `<|...|>`) — Harmony powinien hermetyzować kanały narzędzi.',
    );
  }

  if (outcome.stream_error) {
    outcome.failures.push(`SSE \`event: error\` wystąpiło w strumieniu: ${outcome.stream_error}`);
  }

  return finalize(outcome, t0);
}

function handleSseEvent(
  evt: SseEvent,
  outcome: Outcome,
  finalTextBuffer: string,
  setFinalText: (text: string) => void,
): void {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(evt.data);
  } catch {
    // niektóre eventy mogą być stringami; bez parsowania
  }

  if (evt.name === 'message') {
    // `data: {"delta":"..."}` — finalny tekst dla klienta.
    if (parsed && typeof parsed === 'object' && 'delta' in parsed) {
      const delta = (parsed as { delta: unknown }).delta;
      if (typeof delta === 'string') {
        setFinalText(finalTextBuffer + delta);
      }
    }
    return;
  }

  if (evt.name === 'tool_call' && parsed && typeof parsed === 'object') {
    const list = (parsed as { tool_call?: Array<{ id?: string; name?: string }> }).tool_call;
    if (Array.isArray(list)) {
      for (const t of list) {
        if (t && typeof t.name === 'string') {
          outcome.tool_calls_count += 1;
          outcome.tool_call_names.push(t.name);
        }
      }
    }
    return;
  }

  if (evt.name === 'usage' && parsed && typeof parsed === 'object') {
    const u = parsed as Record<string, unknown>;
    if (typeof u.prompt_tokens === 'number') outcome.prompt_tokens = u.prompt_tokens;
    if (typeof u.completion_tokens === 'number') outcome.completion_tokens = u.completion_tokens;
    if (typeof u.cached_tokens === 'number') outcome.cached_tokens = u.cached_tokens;
    if (typeof u.reasoning_tokens === 'number') outcome.reasoning_tokens = u.reasoning_tokens;
    return;
  }

  if (evt.name === 'done' && parsed && typeof parsed === 'object') {
    const fr = (parsed as { finish_reason?: unknown }).finish_reason;
    if (typeof fr === 'string') outcome.finish_reason = fr;
    return;
  }

  if (evt.name === 'error') {
    outcome.stream_error = evt.data.slice(0, 600);
  }
}

function finalize(outcome: Outcome, t0: number): Outcome {
  outcome.duration_ms_total = Date.now() - t0;
  outcome.pass = outcome.failures.length === 0;
  return outcome;
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

function renderMarkdown(opts: CliOptions, outcome: Outcome): string {
  const lines: string[] = [];
  lines.push(`# Harmony smoke — ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Cel');
  lines.push('');
  lines.push(
    'Walidacja migracji na format Harmony (`groq/openai/gpt-oss-120b`) na żywym endpointcie EPIR.',
  );
  lines.push('');
  lines.push('## Wynik');
  lines.push('');
  lines.push(`- **Verdict:** ${outcome.pass ? 'PASS' : 'FAIL'}`);
  lines.push(`- Endpoint: \`${opts.endpoint}\``);
  lines.push(`- Wariant modelu: \`${opts.variant}\``);
  lines.push(`- Wiadomość użytkownika: \`${opts.message}\``);
  lines.push(`- Oczekiwane narzędzie: \`${opts.expectedTool}\``);
  lines.push(`- Session ID: \`${opts.sessionId}\``);
  lines.push('');
  lines.push('## Metryki');
  lines.push('');
  lines.push('| Pole | Wartość |');
  lines.push('|------|--------:|');
  lines.push(`| http_status | ${outcome.http_status} |`);
  lines.push(`| first_byte_ms | ${outcome.first_byte_ms ?? '—'} |`);
  lines.push(`| stream_total_ms | ${outcome.stream_total_ms ?? '—'} |`);
  lines.push(`| duration_ms_total | ${outcome.duration_ms_total} |`);
  lines.push(`| tool_calls_count | ${outcome.tool_calls_count} |`);
  lines.push(`| tool_call_names | ${outcome.tool_call_names.join(', ') || '—'} |`);
  lines.push(`| final_text_length | ${outcome.final_text_length} |`);
  lines.push(`| finish_reason | ${outcome.finish_reason ?? '—'} |`);
  lines.push(`| prompt_tokens | ${outcome.prompt_tokens ?? '—'} |`);
  lines.push(`| completion_tokens | ${outcome.completion_tokens ?? '—'} |`);
  lines.push(`| cached_tokens | ${outcome.cached_tokens ?? '—'} |`);
  lines.push(`| reasoning_tokens | ${outcome.reasoning_tokens ?? '—'} |`);
  lines.push(`| tool_markup_leak | ${outcome.tool_markup_leak ? 'TRUE' : 'false'} |`);
  lines.push(`| stream_error | ${outcome.stream_error ? `\`${outcome.stream_error}\`` : '—'} |`);
  lines.push('');
  lines.push('## Final text preview (200 znaków)');
  lines.push('');
  lines.push('```');
  lines.push(outcome.final_text_preview || '(brak — finalny tekst pusty)');
  lines.push('```');
  lines.push('');
  lines.push('## Zaobserwowane zdarzenia SSE');
  lines.push('');
  lines.push('```');
  lines.push(outcome.events_seen.join(' → ') || '(brak)');
  lines.push('```');
  lines.push('');
  if (outcome.failures.length > 0) {
    lines.push('## Asercje FAILED');
    lines.push('');
    for (const f of outcome.failures) lines.push(`- ${f}`);
    lines.push('');
  }
  lines.push('## Raw outcome JSON');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(outcome, null, 2));
  lines.push('```');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  console.log(
    `[smoke] endpoint=${opts.endpoint} variant=${opts.variant} expected_tool=${opts.expectedTool} session=${opts.sessionId}`,
  );

  const outcome = await runSmoke(opts);

  const md = renderMarkdown(opts, outcome);
  const outPath = resolve(process.cwd(), opts.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, md, 'utf8');
  console.log(`[smoke] wrote report → ${outPath}`);

  if (outcome.pass) {
    console.log(
      `[smoke] PASS — tool_calls=${outcome.tool_calls_count} (${outcome.tool_call_names.join(',')}) finish_reason=${outcome.finish_reason} ttfb=${outcome.first_byte_ms}ms total=${outcome.stream_total_ms}ms`,
    );
  } else {
    console.error('[smoke] FAIL — see report. Failures:');
    for (const f of outcome.failures) console.error(`  • ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[smoke] fatal:', err);
  process.exit(2);
});
