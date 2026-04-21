/**
 * workers/chat/scripts/bench-models.ts
 *
 * Benchmark harness porównujący warianty modeli dostępne za nagłówkiem
 * `X-Epir-Model-Variant` (admin-only). Uruchamia kanoniczny zestaw scenariuszy
 * przez endpoint `/chat/stream` i zbiera metryki z SSE: `stream_ready_ms`,
 * `first_byte_ms`, `stream_total_ms`, `prompt_tokens`, `cached_tokens`, `finish_reason`.
 *
 * Użycie:
 *   tsx workers/chat/scripts/bench-models.ts \
 *     --endpoint https://chat.epir-art-silver-jewellery.workers.dev \
 *     --admin-key $ADMIN_KEY \
 *     --variants default,k26,glm_flash \
 *     --out docs/benchmarks/$(date +%F)-models.md
 *
 * Skrypt NIE przeprowadza testów korektności odpowiedzi — to ręczny review.
 * Raport: tabela markdown + surowy JSON (CSV opcjonalnie przez `--csv`).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type CliOptions = {
  endpoint: string;
  adminKey: string;
  variants: string[];
  out: string;
  csv?: string;
  repeats: number;
  scenarioFilter?: string;
};

type Scenario = {
  id: string;
  label: string;
  message: string;
  /** Opcjonalnie: wymuszamy konkretny `channel`, `cart_id`, itp. w body. */
  overrides?: Record<string, unknown>;
};

type RunMetrics = {
  variant: string;
  scenario_id: string;
  scenario_label: string;
  stream_ready_ms: number | null;
  first_byte_ms: number | null;
  stream_total_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cached_tokens: number | null;
  cache_hit_ratio: number | null;
  finish_reason: string | null;
  tool_calls_count: number;
  http_status: number;
  error?: string;
};

const DEFAULT_SCENARIOS: Scenario[] = [
  { id: 's01_faq_policy', label: 'FAQ: polityka zwrotów', message: 'Jakie są zasady zwrotów?' },
  { id: 's02_faq_shipping', label: 'FAQ: wysyłka', message: 'Ile kosztuje wysyłka do Polski?' },
  { id: 's03_faq_warranty', label: 'FAQ: gwarancja', message: 'Czy obrączki mają gwarancję?' },
  { id: 's04_catalog_rings', label: 'Catalog: obrączki srebrne', message: 'Pokaż obrączki ze srebra.' },
  { id: 's05_catalog_earrings', label: 'Catalog: kolczyki', message: 'Szukam eleganckich kolczyków na wesele.' },
  { id: 's06_catalog_filter', label: 'Catalog: filtr cenowy', message: 'Pokaż pierścionki do 300 zł.' },
  { id: 's07_cart_add', label: 'Cart: dodaj produkt', message: 'Dodaj do koszyka obrączkę, rozmiar 18.' },
  { id: 's08_cart_view', label: 'Cart: pokaż zawartość', message: 'Co mam w koszyku?' },
  { id: 's09_size_table', label: 'Tabela rozmiarów', message: 'Podaj tabelę rozmiarów pierścionków.' },
  { id: 's10_chitchat', label: 'Small talk: powitanie', message: 'Dzień dobry! Co możesz mi doradzić?' },
  { id: 's11_chitchat_brand', label: 'Small talk: pytanie o markę', message: 'Opowiedz mi o EPIR.' },
  { id: 's12_faq_followup', label: 'FAQ + followup', message: 'Tak, chciałbym zwrócić — jak to zrobić?' },
];

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    args.set(key, value);
  }
  const endpoint = args.get('endpoint') ?? process.env.BENCH_ENDPOINT ?? '';
  const adminKey = args.get('admin-key') ?? process.env.ADMIN_KEY ?? '';
  if (!endpoint) throw new Error('--endpoint is required (e.g. https://chat.epir-art-silver-jewellery.workers.dev)');
  if (!adminKey) throw new Error('--admin-key or ADMIN_KEY env is required');
  const variants = (args.get('variants') ?? 'default,k26,glm_flash').split(',').map((s) => s.trim()).filter(Boolean);
  const out = args.get('out') ?? `docs/benchmarks/${new Date().toISOString().slice(0, 10)}-models.md`;
  const csv = args.get('csv');
  const repeats = Number(args.get('repeats') ?? '1');
  const scenarioFilter = args.get('scenario');
  return { endpoint, adminKey, variants, out, csv, repeats, scenarioFilter };
}

async function runScenario(
  opts: CliOptions,
  scenario: Scenario,
  variant: string,
): Promise<RunMetrics> {
  const url = `${opts.endpoint.replace(/\/$/, '')}/chat/stream`;
  const body = {
    message: scenario.message,
    session_id: `bench-${variant}-${scenario.id}-${Date.now()}`,
    channel: 'internal-dashboard',
    brand: 'EPIR',
    ...scenario.overrides,
  };

  const metrics: RunMetrics = {
    variant,
    scenario_id: scenario.id,
    scenario_label: scenario.label,
    stream_ready_ms: null,
    first_byte_ms: null,
    stream_total_ms: null,
    prompt_tokens: null,
    completion_tokens: null,
    cached_tokens: null,
    cache_hit_ratio: null,
    finish_reason: null,
    tool_calls_count: 0,
    http_status: 0,
  };

  const t0 = Date.now();
  let firstByteAt: number | null = null;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.adminKey}`,
        'X-Epir-Model-Variant': variant === 'default' ? 'default' : variant,
      },
      body: JSON.stringify(body),
    });
    metrics.http_status = response.status;
    metrics.stream_ready_ms = Date.now() - t0;

    if (!response.ok || !response.body) {
      metrics.error = `HTTP ${response.status}`;
      return metrics;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (firstByteAt === null) firstByteAt = Date.now();
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events (separated by \n\n)
      let sepIdx: number;
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        const eventLine = rawEvent.split('\n').find((l) => l.startsWith('event:'));
        const dataLine = rawEvent.split('\n').find((l) => l.startsWith('data:'));
        if (!eventLine || !dataLine) continue;
        const eventName = eventLine.slice(6).trim();
        const dataRaw = dataLine.slice(5).trim();
        let parsed: any = null;
        try {
          parsed = JSON.parse(dataRaw);
        } catch {
          // ignore unparseable frames
        }
        if (eventName === 'usage' && parsed) {
          metrics.prompt_tokens = Number(parsed.prompt_tokens ?? metrics.prompt_tokens ?? 0) || null;
          metrics.completion_tokens =
            Number(parsed.completion_tokens ?? metrics.completion_tokens ?? 0) || null;
          metrics.cached_tokens = Number(parsed.cached_tokens ?? metrics.cached_tokens ?? 0) || null;
          if (metrics.prompt_tokens && metrics.cached_tokens != null) {
            metrics.cache_hit_ratio = Number((metrics.cached_tokens / metrics.prompt_tokens).toFixed(3));
          }
        }
        if (eventName === 'tool_call') metrics.tool_calls_count += 1;
        if (eventName === 'done' && parsed?.finish_reason) {
          metrics.finish_reason = parsed.finish_reason;
        }
      }
    }
    metrics.stream_total_ms = Date.now() - t0;
    if (firstByteAt !== null) metrics.first_byte_ms = firstByteAt - t0;
  } catch (err: any) {
    metrics.error = err?.message ?? String(err);
  }
  return metrics;
}

function summarize(rows: RunMetrics[]): string {
  const byVariant = new Map<string, RunMetrics[]>();
  for (const r of rows) {
    if (!byVariant.has(r.variant)) byVariant.set(r.variant, []);
    byVariant.get(r.variant)!.push(r);
  }
  const lines: string[] = [];
  lines.push('## Podsumowanie (agregaty per wariant)');
  lines.push('');
  lines.push('| Variant | N | p50 stream_ready | p50 first_byte | p50 stream_total | avg prompt | avg cached | avg ratio |');
  lines.push('|---------|---|-----------------:|---------------:|-----------------:|-----------:|-----------:|----------:|');
  for (const [variant, rs] of byVariant) {
    const quant = (vals: number[], p = 0.5): number => {
      const cleaned = vals.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
      if (cleaned.length === 0) return NaN;
      return cleaned[Math.floor(cleaned.length * p)];
    };
    const avg = (vals: number[]): number => {
      const cleaned = vals.filter((v) => Number.isFinite(v));
      if (cleaned.length === 0) return NaN;
      return cleaned.reduce((a, b) => a + b, 0) / cleaned.length;
    };
    const p50Ready = quant(rs.map((r) => r.stream_ready_ms ?? NaN));
    const p50FB = quant(rs.map((r) => r.first_byte_ms ?? NaN));
    const p50Total = quant(rs.map((r) => r.stream_total_ms ?? NaN));
    const avgPrompt = avg(rs.map((r) => r.prompt_tokens ?? NaN));
    const avgCached = avg(rs.map((r) => r.cached_tokens ?? NaN));
    const avgRatio = avg(rs.map((r) => r.cache_hit_ratio ?? NaN));
    lines.push(
      `| ${variant} | ${rs.length} | ${Math.round(p50Ready)} | ${Math.round(p50FB)} | ${Math.round(p50Total)} | ${Math.round(avgPrompt)} | ${Math.round(avgCached)} | ${avgRatio.toFixed(2)} |`,
    );
  }
  return lines.join('\n');
}

function renderMarkdown(rows: RunMetrics[], opts: CliOptions): string {
  const lines: string[] = [];
  lines.push(`# Model benchmark — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`- Endpoint: \`${opts.endpoint}\``);
  lines.push(`- Warianty: ${opts.variants.map((v) => `\`${v}\``).join(', ')}`);
  lines.push(`- Scenariuszy: ${new Set(rows.map((r) => r.scenario_id)).size}`);
  lines.push(`- Powtórzeń: ${opts.repeats}`);
  lines.push('');
  lines.push(summarize(rows));
  lines.push('');
  lines.push('## Szczegóły');
  lines.push('');
  lines.push('| Variant | Scenario | stream_ready_ms | first_byte_ms | stream_total_ms | prompt | completion | cached | ratio | finish | tools | status |');
  lines.push('|---------|----------|----------------:|--------------:|----------------:|-------:|-----------:|-------:|------:|--------|------:|-------:|');
  for (const r of rows) {
    lines.push(
      `| ${r.variant} | ${r.scenario_label} | ${r.stream_ready_ms ?? '—'} | ${r.first_byte_ms ?? '—'} | ${r.stream_total_ms ?? '—'} | ${r.prompt_tokens ?? '—'} | ${r.completion_tokens ?? '—'} | ${r.cached_tokens ?? '—'} | ${r.cache_hit_ratio ?? '—'} | ${r.finish_reason ?? '—'} | ${r.tool_calls_count} | ${r.http_status}${r.error ? ` err=${r.error}` : ''} |`,
    );
  }
  lines.push('');
  lines.push('## Raw JSON');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(rows, null, 2));
  lines.push('```');
  return lines.join('\n');
}

function renderCsv(rows: RunMetrics[]): string {
  const header = [
    'variant', 'scenario_id', 'scenario_label',
    'stream_ready_ms', 'first_byte_ms', 'stream_total_ms',
    'prompt_tokens', 'completion_tokens', 'cached_tokens', 'cache_hit_ratio',
    'finish_reason', 'tool_calls_count', 'http_status', 'error',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      header
        .map((h) => {
          const v = (r as any)[h];
          if (v == null) return '';
          if (typeof v === 'string') return JSON.stringify(v);
          return String(v);
        })
        .join(','),
    );
  }
  return lines.join('\n');
}

async function main() {
  const opts = parseArgs(process.argv);
  const scenarios = opts.scenarioFilter
    ? DEFAULT_SCENARIOS.filter((s) => s.id.includes(opts.scenarioFilter!))
    : DEFAULT_SCENARIOS;
  if (scenarios.length === 0) throw new Error('No scenarios matched filter');

  console.log(`[bench] endpoint=${opts.endpoint} variants=${opts.variants.join(',')} scenarios=${scenarios.length} repeats=${opts.repeats}`);

  const rows: RunMetrics[] = [];
  for (const variant of opts.variants) {
    for (const scenario of scenarios) {
      for (let r = 0; r < opts.repeats; r++) {
        process.stderr.write(`  → ${variant} / ${scenario.id} [${r + 1}/${opts.repeats}]... `);
        const result = await runScenario(opts, scenario, variant);
        rows.push(result);
        process.stderr.write(`${result.stream_total_ms ?? '—'}ms status=${result.http_status}${result.error ? ` err` : ''}\n`);
      }
    }
  }

  const md = renderMarkdown(rows, opts);
  const outPath = resolve(process.cwd(), opts.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, md, 'utf8');
  console.log(`[bench] wrote ${outPath}`);

  if (opts.csv) {
    const csvPath = resolve(process.cwd(), opts.csv);
    mkdirSync(dirname(csvPath), { recursive: true });
    writeFileSync(csvPath, renderCsv(rows), 'utf8');
    console.log(`[bench] wrote ${csvPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
