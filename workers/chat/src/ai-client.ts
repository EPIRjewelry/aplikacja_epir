/**
 * worker/src/ai-client.ts
 * Ujednolicony klient do komunikacji z Workers AI.
 * Nazwy typów/historycznych funkcji pozostają dla kompatybilności z istniejącym kodem.
 */

import type { AiClientEnv } from './config/bindings';
import {
  CHAT_MODEL_ID,
  MODEL_PARAMS,
  MODEL_VARIANTS,
  type ModelCapabilities,
  type ModelVariantKey,
} from './config/model-params';
import {
  catalogEntryToCapabilities,
  fetchOpenRouterCatalog,
  findCatalogEntry,
  isValidOpenRouterModelId,
} from './openrouter-catalog';
import { sanitizeHarmonyHistory } from './utils/sanitizeHarmonyHistory';

export type GroqToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type GroqToolCallDefinition = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: unknown;
  };
};

export type KimiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: string } };

export type GroqMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | KimiContentPart[] | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

type GatewayCompatBody = {
  model: string;
  messages: GroqMessage[];
  stream?: boolean;
  tools?: GroqToolCallDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  /**
   * Twardy flag: Harmony pozwala modelowi emitować równoległe `tool_calls` w jednym
   * kroku. Aktualne API Groq akceptuje `parallel_tool_calls: true` (domyślnie true).
   */
  parallel_tool_calls?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  /** Harmony: dołącz kanał reasoning (`delta.reasoning`) do streamu. */
  include_reasoning?: boolean;
  /** Harmony: budżet rozumowania (`low` = krótszy chain-of-thought, niższe TTFT). */
  reasoning_effort?: 'low' | 'medium' | 'high';
};

/**
 * Format Harmony (GPT-OSS-120B przez Groq) dostarcza trzy kanały w jednym strumieniu:
 * - `analysis` (reasoning / chain of thought) — w odpowiedzi pola `delta.reasoning`
 *   lub `delta.reasoning_content`. NIGDY nie trafia do widoku klienta;
 *   emitujemy jako osobne zdarzenie `reasoning` dla telemetrii i fallbacku w pamięci.
 * - `commentary` (preambuła + `tool_calls`) — pola `delta.tool_calls`. Hermetyzowane przez API.
 * - `final` (odpowiedź dla klienta) — pole `delta.content`. To jedyna treść `'text'`,
 *   którą parser przekazuje na frontend.
 */
export type GroqStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_call'; call: GroqToolCall }
  | {
      type: 'usage';
      prompt_tokens: number;
      completion_tokens: number;
      /**
       * Workers AI (OpenAI-compat) zwraca `usage.prompt_tokens_details.cached_tokens`
       * tylko gdy prefix cache trafił. `0` = cache miss lub brak pola w odpowiedzi modelu.
       * Używane do wyliczenia `cache_hit_ratio = cached_tokens / prompt_tokens`.
       */
      cached_tokens?: number;
      /** Tokeny rozumowania (Harmony `analysis`). Liczone po stronie Groq. */
      reasoning_tokens?: number;
    }
  | { type: 'done'; finish_reason?: string }
  /** OpenRouter image generation (Recraft, Flux, …) — base64 data URLs. */
  | { type: 'generated_images'; urls: string[] };

type AIBinding = {
  run: (
    model: string,
    input: unknown,
    options?: { headers?: Record<string, string> },
  ) => Promise<unknown>;
};

export function shouldUseWorkersAi(env: AiClientEnv): boolean {
  return !!env.AI?.run;
}

const WORKERS_AI_SESSION_ID_MAX_LENGTH = 64;
const WORKERS_AI_SESSION_ID_SAFE_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Odfiltrowuje `session_id` pod nagłówek Workers AI `x-session-affinity` (prefix cache / affinity, niższy TTFT przy stabilnej sesji).
 * Zgodne z widgetem: `crypto.randomUUID()` (np. `550e8400-e29b-41d4-a716-446655440000`) — dozwolone: A–Z, a–z, 0–9, `_`, `-`.
 * Przy braku dopasowania nagłówek nie jest wysyłany (po cichu); nie używaj w ID znaków spoza listy.
 */
export function normalizeWorkersAiSessionId(sessionId?: string): string | undefined {
  const trimmed = sessionId?.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.slice(0, WORKERS_AI_SESSION_ID_MAX_LENGTH);
  if (!WORKERS_AI_SESSION_ID_SAFE_PATTERN.test(normalized)) return undefined;
  return normalized;
}

/** Opcje `env.AI.run`: ustawia `x-session-affinity`, gdy {@link normalizeWorkersAiSessionId} zwraca wartość. */
export function workersAiRunOptions(sessionId?: string): { headers?: Record<string, string> } | undefined {
  const normalizedSessionId = normalizeWorkersAiSessionId(sessionId);
  if (!normalizedSessionId) return undefined;
  return {
    headers: {
      'x-session-affinity': `ses_${normalizedSessionId}`,
    },
  };
}

function mapMessageForWorkersAI(m: GroqMessage): { role: string; content: string | KimiContentPart[] } {
  const c = m.content;
  if (c === null || c === undefined) return { role: m.role, content: '' };
  if (typeof c === 'string') return { role: m.role, content: c };
  if (Array.isArray(c)) return { role: m.role, content: c };
  return { role: m.role, content: '' };
}

export function injectKimiMultimodalUserContent(
  messages: GroqMessage[],
  imageDataUri: string,
): GroqMessage[] {
  const out = messages.map((m) => ({ ...m }));
  for (let i = out.length - 1; i >= 0; i--) {
    const msg = out[i]!;
    if (msg.role !== 'user') continue;
    const content = msg.content;
    if (typeof content !== 'string') continue;
    const text = content;
    const parts: KimiContentPart[] = [];
    if (text.trim()) parts.push({ type: 'text', text: text.trim() });
    parts.push({ type: 'image_url', image_url: { url: imageDataUri } });
    out[i] = { ...msg, content: parts };
    break;
  }
  return out;
}

function requireAi(env: AiClientEnv): AIBinding {
  if (!env.AI?.run) {
    throw new Error('Workers AI binding missing. Add [ai] binding in wrangler.toml.');
  }
  return env.AI;
}

async function callGatewayCompat(
  env: AiClientEnv,
  body: GatewayCompatBody,
  {
    timingLabel = 'callGatewayCompat',
    abortSignal,
  }: { timingLabel?: string; abortSignal?: AbortSignal } = {},
): Promise<Response> {
  const accountId = env.CF_ACCOUNT_ID;
  const gatewayId = env.AI_GATEWAY_ID ?? 'epir-ai-gateway';
  const gatewayToken = env.AI_GATEWAY_TOKEN?.trim();
  const groqApiKey = env.GROQ_API_KEY?.trim();
  if (!gatewayToken) throw new Error('AI_GATEWAY_TOKEN is missing');
  if (!groqApiKey) throw new Error('GROQ_API_KEY is missing');

  const url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/groq/chat/completions`;

  const modelId = body.model;
  const modelName = modelId.replace('groq/', '');
  const payload: GatewayCompatBody = {
    ...body,
    model: modelName,
  };

  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    signal: abortSignal,
    headers: {
      'Content-Type': 'application/json',
      'cf-aig-authorization': `Bearer ${gatewayToken}`,
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const dt = Date.now() - t0;
  console.log(
    `[AI Gateway] ${timingLabel} status=${res.status} model=${payload.model} stream=${payload.stream ? 'true' : 'false'} duration_ms=${dt}`,
  );

  return res;
}

/**
 * Mierzy czas w `wrangler tail`: (1) `stream_ready_ms` — do zwrócenia strumienia przez `ai.run`,
 * (2) `first_byte_ms` — do pierwszego bajtu odpowiedzi (proxy za TTFT), (3) `stream_total_ms` — do końca strumienia.
 */
function wrapUint8StreamWithWorkersAiTiming(
  stream: ReadableStream<Uint8Array>,
  timingLabel: string,
  t0: number,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  let firstByte = true;
  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log(
              `[Workers AI] ${timingLabel} stream_total_ms=${Date.now() - t0} model=${CHAT_MODEL_ID}`,
            );
            controller.close();
            return;
          }
          if (firstByte && value && value.byteLength > 0) {
            firstByte = false;
            console.log(
              `[Workers AI] ${timingLabel} first_byte_ms=${Date.now() - t0} model=${CHAT_MODEL_ID}`,
            );
          }
          controller.enqueue(value);
        }
      } catch (err) {
        console.error(
          `[Workers AI] ${timingLabel} stream_error_ms=${Date.now() - t0} model=${CHAT_MODEL_ID}`,
          stringifyForLog(err),
        );
        controller.error(err);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

function stringifyForLog(value: unknown): string {
  try {
    if (value instanceof Error) {
      const errorWithCause = value as Error & { cause?: unknown };
      return (
        JSON.stringify({
          name: value.name,
          message: value.message,
          stack: value.stack,
          ...(errorWithCause.cause !== undefined ? { cause: errorWithCause.cause } : {}),
        }) ?? String(value)
      );
    }

    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 4000);
  } catch {
    return '<failed_to_read_response_body>';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractTextFromAiContent(content: unknown): string | null {
  if (typeof content === 'string') {
    return content.trim().length > 0 ? content : null;
  }

  if (!Array.isArray(content)) return null;

  const joined = content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (isRecord(part) && typeof part.text === 'string') return part.text;
      return '';
    })
    .join('')
    .trim();

  return joined.length > 0 ? joined : null;
}

/** Pierwsza zbalansowana tablica JSON `[`…`]` (np. ekstraktor faktów w reasoning). */
function sliceBalancedJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

type ExtractTextFromAiResultOptions = {
  /** Tylko ścieżka pamięci: Qwen bywa `content: null` + `reasoning_content`. */
  memoryReasoningFallback?: boolean;
};

function extractTextFromAiResult(
  result: unknown,
  opts?: ExtractTextFromAiResultOptions,
): string | null {
  if (!isRecord(result)) return null;

  const outText = result.output_text;
  if (typeof outText === 'string' && outText.trim().length > 0) {
    return outText.trim();
  }

  // Workers AI: `{ response: { role: 'assistant', content: [{ type: 'text', text }] } }`
  if (isRecord(result.response)) {
    const nested = extractTextFromAiContent((result.response as Record<string, unknown>).content);
    if (nested) return nested;
  }

  const directResponse = extractTextFromAiContent(result.response);
  if (directResponse) return directResponse;

  if (Array.isArray(result.choices) && result.choices.length > 0) {
    const firstChoice = result.choices[0];
      if (isRecord(firstChoice)) {
      const message = isRecord(firstChoice.message) ? firstChoice.message : null;
      const messageContent = extractTextFromAiContent(message?.content);
      if (messageContent) return messageContent;

      if (message) {
        const mRef = message as Record<string, unknown>;
        const reasoning = mRef.reasoning;
        if (typeof reasoning === 'string' && reasoning.trim().length > 0) {
          return reasoning.trim();
        }
        const mText = mRef.text;
        if (typeof mText === 'string' && mText.trim().length > 0) {
          return mText.trim();
        }
        if (opts?.memoryReasoningFallback) {
          const rc = mRef.reasoning_content;
          if (typeof rc === 'string' && rc.trim().length > 0) {
            const trimmed = rc.trim();
            const arr = sliceBalancedJsonArray(trimmed);
            if (arr) return arr;
            return trimmed;
          }
        }
      }

      const delta = isRecord(firstChoice.delta) ? firstChoice.delta : null;
      const deltaContent = extractTextFromAiContent(delta?.content);
      if (deltaContent) return deltaContent;
    }
  }

  // Legacy / alternative response shapes: OpenAI-style `choices[].text`
  if (Array.isArray(result.choices) && result.choices.length > 0) {
    const firstChoice = result.choices[0];
    if (isRecord(firstChoice) && typeof firstChoice.text === 'string' && firstChoice.text.trim()) {
      return firstChoice.text.trim();
    }

    // Join text fields from multiple choices if present
    const texts: string[] = [];
    for (const ch of result.choices) {
      if (isRecord(ch) && typeof ch.text === 'string' && ch.text.trim()) texts.push(ch.text.trim());
    }
    if (texts.length > 0) return texts.join('\n\n');
  }

  if (result.result !== undefined && result.result !== result) {
    return extractTextFromAiResult(result.result, opts);
  }

  return null;
}

/**
 * Produkuje drobne metadane diagnostyczne z pustej odpowiedzi Workers AI,
 * żeby odróżnić pustą generację od refusal/content_filter/length.
 */
function describeEmptyAiResult(result: unknown): Record<string, unknown> {
  if (!isRecord(result)) return { shape: typeof result };
  const meta: Record<string, unknown> = {};
  if (Array.isArray(result.choices) && result.choices.length > 0) {
    const first = result.choices[0];
    if (isRecord(first)) {
      meta.first_choice_keys = Object.keys(first);
      if (typeof first.finish_reason === 'string') meta.finish_reason = first.finish_reason;
      const message = isRecord(first.message) ? first.message : null;
      if (message) {
        meta.message_keys = Object.keys(message);
        const c = message.content;
        if (typeof c === 'string') {
          meta.content_type = 'string';
          meta.content_preview = c.slice(0, 200);
          meta.content_len = c.length;
        } else if (c === null) {
          meta.content_type = 'null';
          meta.content_preview = null;
        } else if (Array.isArray(c)) {
          meta.content_type = 'array';
          meta.content_len = c.length;
          if (c.length > 0 && isRecord(c[0])) {
            const z = c[0] as Record<string, unknown>;
            meta.content_0_type = typeof z.type === 'string' ? z.type : 'object';
          }
        } else {
          meta.content_type = typeof c;
        }
        if (typeof message.refusal === 'string') {
          meta.refusal_preview = message.refusal.slice(0, 200);
        }
        if (Array.isArray(message.tool_calls)) {
          meta.tool_calls_count = message.tool_calls.length;
        }
      }
      // Legacy OpenAI-style `text` field on choices
      if (typeof first.text === 'string') {
        meta.content_preview = first.text.slice(0, 200);
        meta.content_len = first.text.length;
      }
    }
  }
  if (typeof result.output_text === 'string') {
    meta.output_text_len = result.output_text.length;
  }
  if (isRecord(result.usage)) {
    const u = result.usage as Record<string, unknown>;
    if (typeof u.completion_tokens === 'number') meta.completion_tokens = u.completion_tokens;
    if (typeof u.prompt_tokens === 'number') meta.prompt_tokens = u.prompt_tokens;
  }
  return meta;
}

async function runModelStream(
  messages: GroqMessage[],
  env: AiClientEnv,
  options?: {
    tools?: GroqToolCallDefinition[];
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    sessionId?: string;
    /** Etykieta w logach `[Workers AI]` (np. iteracja narzędzi). */
    timingLabel?: string;
    /**
     * Override ID modelu; jeśli `undefined` → CHAT_MODEL_ID (canonical).
     * Używane przez admin-only X-Epir-Model-Variant routing. Caller jest odpowiedzialny
     * za guardy (multimodal / toolLeak) przed przekazaniem tu override'u.
     */
    modelId?: string;
    /** Override `max_tokens` (np. niższy po wynikach narzędzi). */
    maxTokens?: number;
  },
): Promise<ReadableStream<Uint8Array>> {
  const ai = requireAi(env);
  const timingLabel = options?.timingLabel ?? 'runModelStream';
  const resolvedModel = options?.modelId ?? CHAT_MODEL_ID;
  const t0 = Date.now();
  const stream = (await ai.run(
    resolvedModel,
    {
      messages: messages.map(mapMessageForWorkersAI),
      stream: true,
      temperature: MODEL_PARAMS.temperature,
      max_tokens: options?.maxTokens ?? MODEL_PARAMS.max_tokens,
      tools: options?.tools,
      tool_choice: options?.tool_choice,
    },
    workersAiRunOptions(options?.sessionId),
  )) as ReadableStream<Uint8Array>;

  const streamReadyMs = Date.now() - t0;
  console.log(
    `[Workers AI] ${timingLabel} stream_ready_ms=${streamReadyMs} model=${resolvedModel}${resolvedModel !== CHAT_MODEL_ID ? ' variant_override=true' : ''}`,
  );

  if (!stream || typeof stream.getReader !== 'function') {
    throw new Error('Workers AI did not return a stream');
  }

  return wrapUint8StreamWithWorkersAiTiming(stream, timingLabel, t0);
}

export async function streamGroqResponse(
  messages: GroqMessage[],
  env: AiClientEnv,
  sessionId?: string,
): Promise<ReadableStream<string>> {
  let buffer = '';
  const stream = await runModelStream(sanitizeHarmonyHistory(messages), env, {
    sessionId,
    timingLabel: 'streamGroqResponse',
  });

  return stream
    .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
    .pipeThrough(
      new TransformStream<string, string>({
        transform(chunk, controller) {
          buffer += chunk;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          for (const raw of lines) {
            const trimmed = raw.trim();
            if (!trimmed || trimmed === 'data: [DONE]' || trimmed === '[DONE]') continue;
            const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
            try {
              const parsed = JSON.parse(payload);
              const content =
                parsed?.choices?.[0]?.delta?.content ?? parsed?.choices?.[0]?.message?.content;
              if (typeof content === 'string' && content) controller.enqueue(content);
            } catch (_) {}
          }
        },
        flush(controller) {
          const trimmed = buffer.trim();
          if (!trimmed || trimmed === 'data: [DONE]' || trimmed === '[DONE]') return;
          const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
          try {
            const parsed = JSON.parse(payload);
            const content =
              parsed?.choices?.[0]?.delta?.content ?? parsed?.choices?.[0]?.message?.content;
            if (typeof content === 'string' && content) controller.enqueue(content);
          } catch (_) {}
        },
      }),
    );
}

/** Klucz scalania fragmentów tool_calls ze strumienia (Workers AI / OpenAI): `index` lub pozycja w tablicy — NIE `call_${n}` przy braku id. */
function toolCallSlotKey(call: { index?: number }, positionInBatch: number): string {
  if (typeof call.index === 'number' && Number.isFinite(call.index)) return `slot:${call.index}`;
  return `slot:${positionInBatch}`;
}

function mergeToolCallDelta(
  existing: GroqToolCall | undefined,
  call: {
    id?: string;
    index?: number;
    function?: { name?: string; arguments?: string };
  },
  slotKey: string,
): GroqToolCall {
  const argDelta = typeof call.function?.arguments === 'string' ? call.function.arguments : '';
  const prev = existing ?? { id: '', name: '', arguments: '' };
  const id = (call.id && String(call.id).trim()) || (prev.id && prev.id.trim()) || slotKey;
  const name = (call.function?.name && String(call.function.name)) || prev.name || '';
  return {
    id,
    name,
    arguments: `${prev.arguments}${argDelta}`,
  };
}

/** Po zakończeniu narzędzi w turze: jedno zdarzenie na slot (unika dziesiątek fałszywych wywołań MCP). */
function emitMergedToolCalls(
  toolBuffers: Map<string, GroqToolCall>,
  controller: TransformStreamDefaultController<GroqStreamEvent>,
) {
  const sorted = [...toolBuffers.entries()].sort((a, b) => {
    const na = Number(String(a[0].replace('slot:', '')));
    const nb = Number(String(b[0].replace('slot:', '')));
    return (Number.isFinite(na) ? na : 0) - (Number.isFinite(nb) ? nb : 0);
  });
  for (const [, call] of sorted) {
    if (!call.name && !call.arguments.trim()) continue;
    controller.enqueue({ type: 'tool_call', call: { ...call } });
  }
}

function createGroqStreamTransform(): TransformStream<string, GroqStreamEvent> {
  let buffer = '';
  const toolBuffers = new Map<string, GroqToolCall>();
  let sseEventName = '';
  let sseDataLines: string[] = [];

  const parseSseDataJson = (joinedData: string): any | null => {
    const trimmed = joinedData.trim();
    if (!trimmed || trimmed === '[DONE]') return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  };

  const emitStreamErrorMetric = (payload: unknown) => {
    const payloadObj = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
    const errorObj =
      payloadObj && payloadObj.error && typeof payloadObj.error === 'object'
        ? (payloadObj.error as Record<string, unknown>)
        : null;
    const message =
      errorObj && typeof errorObj.message === 'string'
        ? errorObj.message
        : '';
    const validationType =
      errorObj && typeof errorObj.type === 'string'
        ? errorObj.type
        : errorObj && typeof errorObj.code === 'string'
          ? errorObj.code
          : 'unknown';
    const isSearchCatalogValidation =
      message.includes('search_catalog') &&
      (message.includes('catalog') || message.includes('missing_required_parameter'));
    console.error(
      JSON.stringify({
        tag: 'chat.stream.gateway_error',
        error_type: isSearchCatalogValidation ? 'search_catalog_validation' : 'other',
        validation_type: validationType,
      }),
    );
  };

  const finalizeSseEvent = (
    controller: TransformStreamDefaultController<GroqStreamEvent>,
    isFlush: boolean,
  ) => {
    if (!sseEventName && sseDataLines.length === 0) return;

    const eventName = sseEventName.trim().toLowerCase();
    const joinedData = sseDataLines.join('\n').trim();
    sseEventName = '';
    sseDataLines = [];

    if (!joinedData) return;
    if (joinedData === '[DONE]') {
      if (toolBuffers.size > 0) {
        emitMergedToolCalls(toolBuffers, controller);
        toolBuffers.clear();
      }
      controller.enqueue({ type: 'done', finish_reason: 'stop' });
      return;
    }

    if (eventName === 'error') {
      console.error('[GROQ-STREAM-ERROR]', joinedData);
      const parsedError = parseSseDataJson(joinedData);
      emitStreamErrorMetric(parsedError ?? joinedData);
      throw new Error('AI Gateway stream error event from Groq');
    }

    const parsed = parseSseDataJson(joinedData);
    if (!parsed) return;
    processParsedLine(parsed, controller, isFlush);
  };

  const processParsedLine = (
    parsed: any,
    controller: TransformStreamDefaultController<GroqStreamEvent>,
    isFlush: boolean,
  ) => {
    const choice = parsed?.choices?.[0];
    const finishReason = choice?.finish_reason as string | undefined;

    const delta = choice?.delta;
    const message = choice?.message;

    // ====== Harmony: kanał `final` (treść dla klienta) ======
    // Wymagamy stringa; obiekt/tablica `content` (multimodal) zostanie zignorowana,
    // bo Harmony emituje finalną wypowiedź klienta zawsze jako tekst.
    const deltaText = typeof delta?.content === 'string' ? delta.content : '';
    const msgText = typeof message?.content === 'string' ? message.content : '';
    const text = deltaText || msgText;
    if (text) controller.enqueue({ type: 'text', delta: text });

    const imageUrls = [
      ...extractOpenRouterImageUrls(delta),
      ...extractOpenRouterImageUrls(message),
    ];
    if (imageUrls.length > 0) {
      controller.enqueue({ type: 'generated_images', urls: imageUrls });
    }

    // ====== Harmony: kanał `analysis` (reasoning / chain of thought) ======
    // Groq zwraca pole `delta.reasoning` (preferowane) lub `delta.reasoning_content`
    // (alias). Nie przekazujemy go na frontend — emitujemy jako osobne zdarzenie
    // diagnostyczne, które konsumują logi/telemetria.
    const reasoningDeltaRaw =
      typeof delta?.reasoning === 'string'
        ? delta.reasoning
        : typeof delta?.reasoning_content === 'string'
          ? delta.reasoning_content
          : typeof message?.reasoning === 'string'
            ? message.reasoning
            : typeof message?.reasoning_content === 'string'
              ? message.reasoning_content
              : '';
    if (reasoningDeltaRaw) {
      controller.enqueue({ type: 'reasoning', delta: reasoningDeltaRaw });
    }

    // ====== Harmony: kanał `commentary` (`tool_calls`, równoległe) ======
    // GPT-OSS-120B potrafi wyemitować wiele tool_calls w jednym kroku — każde
    // ma własny `index` w tablicy `delta.tool_calls`. Slot-based merge gwarantuje,
    // że argumenty kolejnych chunków trafiają do właściwej pozycji.
    const toolCalls = delta?.tool_calls || message?.tool_calls;
    if (Array.isArray(toolCalls)) {
      for (let i = 0; i < toolCalls.length; i++) {
        const call = toolCalls[i];
        const slotKey = toolCallSlotKey(call, i);
        const merged = mergeToolCallDelta(toolBuffers.get(slotKey), call, slotKey);
        toolBuffers.set(slotKey, merged);
      }
    }

    if (finishReason === 'tool_calls' || finishReason === 'stop') {
      if (toolBuffers.size > 0) {
        emitMergedToolCalls(toolBuffers, controller);
        toolBuffers.clear();
      }
    }

    if (finishReason) {
      controller.enqueue({ type: 'done', finish_reason: finishReason });
    }

    const usage = parsed?.usage;
    if (usage && typeof usage === 'object') {
      const p = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
      const c = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
      const cachedRaw =
        usage.prompt_tokens_details?.cached_tokens ??
        usage.cached_tokens ??
        usage.prompt_cache_hit_tokens ??
        0;
      const cached = Number.isFinite(Number(cachedRaw)) ? Number(cachedRaw) : 0;
      const cachedNormalized = cached > 0 ? cached : 0;

      // Harmony zwraca dodatkowo `completion_tokens_details.reasoning_tokens`
      // — to pomaga ocenić, ile budżetu zjadł kanał `analysis`.
      const reasoningRaw =
        usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? 0;
      const reasoningTokens = Number.isFinite(Number(reasoningRaw)) ? Number(reasoningRaw) : 0;

      const evt: Extract<GroqStreamEvent, { type: 'usage' }> = {
        type: 'usage',
        prompt_tokens: p,
        completion_tokens: c,
        cached_tokens: cachedNormalized,
      };
      if (reasoningTokens > 0) evt.reasoning_tokens = reasoningTokens;
      controller.enqueue(evt);

      if (p > 0 && cachedNormalized > 0) {
        const ratio = cachedNormalized / p;
        console.log(
          `[Workers AI] cache_hit cached_tokens=${cachedNormalized} prompt_tokens=${p} ratio=${ratio.toFixed(3)} model=${CHAT_MODEL_ID}`,
        );
      }
    }

    if (isFlush && toolBuffers.size > 0) {
      emitMergedToolCalls(toolBuffers, controller);
      toolBuffers.clear();
    }
  };

  return new TransformStream<string, GroqStreamEvent>({
    start() {
      buffer = '';
      toolBuffers.clear();
      sseEventName = '';
      sseDataLines = [];
    },
    transform(chunk, controller) {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trimEnd();
        const trimmed = line.trim();
        if (!trimmed) {
          finalizeSseEvent(controller, false);
          continue;
        }

        if (trimmed.startsWith('event:')) {
          const value = trimmed.slice(6).trim();
          sseEventName = value;
          continue;
        }

        if (trimmed.startsWith('data:')) {
          const payload = trimmed.slice(5).trimStart();
          if (payload === '[DONE]') {
            finalizeSseEvent(controller, false);
            sseDataLines.push('[DONE]');
            finalizeSseEvent(controller, false);
            continue;
          }
          sseDataLines.push(payload);
          const joinedData = sseDataLines.join('\n').trim();
          try {
            const parsed: unknown = JSON.parse(joinedData);
            if (
              parsed &&
              typeof parsed === 'object' &&
              (Array.isArray((parsed as { choices?: unknown }).choices) ||
                ((parsed as { usage?: unknown }).usage !== undefined &&
                  typeof (parsed as { usage?: unknown }).usage === 'object'))
            ) {
              finalizeSseEvent(controller, false);
            }
          } catch {
            /* niekompletny JSON — czekaj na kolejne linie `data:` */
          }
          continue;
        }

        // Toleruj niestandardowe/legacy linie z samym JSON-em bez prefixu `data:`.
        sseDataLines.push(trimmed);
      }
    },
    flush(controller) {
      const trimmed = buffer.trim();
      if (trimmed) {
        if (trimmed.startsWith('event:')) {
          sseEventName = trimmed.slice(6).trim();
        } else if (trimmed.startsWith('data:')) {
          sseDataLines.push(trimmed.slice(5).trimStart());
        } else {
          sseDataLines.push(trimmed);
        }
      }

      try {
        finalizeSseEvent(controller, true);
      } finally {
        if (toolBuffers.size > 0) {
          emitMergedToolCalls(toolBuffers, controller);
          toolBuffers.clear();
        }
      }
    },
  });
}

export type StreamGroqEventsToolChoice =
  | 'auto'
  | 'none'
  | { type: 'function'; function: { name: string } };

export type StreamGroqEventsOptions = {
  /**
   * Opcjonalne wymuszenie wyboru narzędzia w pierwszej turze pętli `streamAssistantResponse`.
   * Gdy `undefined`, zachowujemy zachowanie domyślne: `'auto'` jeżeli są narzędzia, inaczej `undefined`.
   */
  toolChoice?: StreamGroqEventsToolChoice;
  /**
   * Override ID modelu (admin-only A/B). Caller powinien użyć `resolveModelVariant`
   * i samemu zastosować guardy (np. fallback dla multimodal).
   */
  modelId?: string;
  /** Capabilities z resolveOperatorModelOverride (dynamiczny katalog OR). */
  modelCapabilities?: ModelCapabilities;
  /** Override `max_tokens` dla tej tury streamu. */
  maxTokens?: number;
  /** Anulowanie żądania (np. ścieżka AI Gateway); Workers AI `runModelStream` na razie tego nie używa. */
  abortSignal?: AbortSignal;
};

async function streamGroqEventsWorkersAi(
  messages: GroqMessage[],
  env: AiClientEnv,
  tools?: GroqToolCallDefinition[],
  sessionId?: string,
  timingLabel?: string,
  options?: StreamGroqEventsOptions,
): Promise<ReadableStream<GroqStreamEvent>> {
  const sanitizedMessages = sanitizeHarmonyHistory(messages);
  const defaultToolChoice = tools && tools.length > 0 ? 'auto' : undefined;
  const resolvedToolChoice =
    options?.toolChoice !== undefined ? options.toolChoice : defaultToolChoice;

  const stream = await runModelStream(sanitizedMessages, env, {
    tools,
    tool_choice: resolvedToolChoice,
    sessionId,
    timingLabel: timingLabel ?? 'streamGroqEvents',
    modelId: options?.modelId,
    maxTokens: options?.maxTokens,
  });

  return stream
    .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
    .pipeThrough(createGroqStreamTransform());
}

export async function streamGroqEvents(
  messages: GroqMessage[],
  env: AiClientEnv,
  tools?: GroqToolCallDefinition[],
  sessionId?: string,
  /** Np. `tool_loop_0` — w logach `wrangler tail` odróżnia kolejne wywołania modelu w pętli narzędzi. */
  timingLabel?: string,
  options?: StreamGroqEventsOptions,
): Promise<ReadableStream<GroqStreamEvent>> {
  return routedStreamGroqEvents(messages, env, tools, sessionId, timingLabel, options);
}

export async function streamGroqEventsViaGateway(
  messages: GroqMessage[],
  env: AiClientEnv,
  tools?: GroqToolCallDefinition[],
  sessionId?: string,
  timingLabel?: string,
  options?: StreamGroqEventsOptions,
): Promise<ReadableStream<GroqStreamEvent>> {
  void sessionId;

  const sanitizedMessages = sanitizeHarmonyHistory(messages);
  const defaultToolChoice = tools && tools.length > 0 ? 'auto' : undefined;
  const resolvedToolChoice =
    options?.toolChoice !== undefined ? options.toolChoice : defaultToolChoice;

  const resolvedModel = options?.modelId ?? MODEL_VARIANTS.default.id;

  const body: GatewayCompatBody = {
    model: resolvedModel,
    messages: sanitizedMessages,
    stream: true,
    tools,
    tool_choice: resolvedToolChoice,
    parallel_tool_calls: true,
    max_tokens: options?.maxTokens ?? MODEL_PARAMS.max_tokens,
    temperature: MODEL_PARAMS.temperature,
    top_p: MODEL_PARAMS.top_p,
    include_reasoning: MODEL_PARAMS.include_reasoning,
    reasoning_effort: MODEL_PARAMS.reasoning_effort,
  };

  const res = await callGatewayCompat(env, body, {
    timingLabel: timingLabel ?? 'streamGroqEventsViaGateway',
    abortSignal: options?.abortSignal,
  });

  if (!res.ok || !res.body) {
    const text = await safeReadText(res);
    console.error(
      `[AI Gateway] streamGroqEventsViaGateway http_error status=${res.status} body=${text}`,
    );
    throw new Error(`AI Gateway streaming error: ${res.status}`);
  }

  return (res.body as ReadableStream<Uint8Array>)
    .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
    .pipeThrough(createGroqStreamTransform());
}

function isGatewayModelId(modelId: string): boolean {
  // Na razie rozróżniamy po prefixie providera, możesz później rozszerzyć
  return modelId.startsWith('groq/');
}

function isOpenRouterModelId(modelId: string): boolean {
  return modelId.startsWith('openrouter/');
}

function resolveOpenRouterVariantByModelName(modelName: string): ModelCapabilities | null {
  for (const key of Object.keys(MODEL_VARIANTS) as ModelVariantKey[]) {
    const cap = MODEL_VARIANTS[key];
    if (cap.id === `openrouter/${modelName}`) return cap;
  }
  return null;
}

/** OpenRouter: modele imageGen (Recraft V4.1 itd.) — tylko `modalities: ["image"]` (nie image+text). */
function openRouterImageGenModalities(
  modelId: string,
  activeCap?: ModelCapabilities | null,
): string[] | undefined {
  if (activeCap?.imageGen) return ['image'];
  const modelName = modelId.replace(/^openrouter\//, '');
  const cap = resolveOpenRouterVariantByModelName(modelName);
  if (cap?.imageGen) return ['image'];
  if (modelName.startsWith('recraft/')) return ['image'];
  if (/\/flux|stable-diffusion|dall-e/i.test(modelName)) return ['image'];
  return undefined;
}

function extractOpenRouterImageUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  const images = obj.images;
  if (!Array.isArray(images)) return [];
  const urls: string[] = [];
  for (const item of images) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const imageUrl = row.image_url;
    if (imageUrl && typeof imageUrl === 'object') {
      const url = (imageUrl as Record<string, unknown>).url;
      if (typeof url === 'string' && url.trim()) urls.push(url.trim());
    }
    const alt = row.imageUrl;
    if (alt && typeof alt === 'object') {
      const url = (alt as Record<string, unknown>).url;
      if (typeof url === 'string' && url.trim()) urls.push(url.trim());
    }
  }
  return urls;
}

async function streamGroqEventsOpenRouter(
  messages: GroqMessage[],
  env: AiClientEnv,
  tools?: GroqToolCallDefinition[],
  _sessionId?: string,
  timingLabel?: string,
  options?: StreamGroqEventsOptions,
): Promise<ReadableStream<GroqStreamEvent>> {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing');

  const sanitizedMessages = sanitizeHarmonyHistory(messages);
  const defaultToolChoice = tools && tools.length > 0 ? 'auto' : undefined;
  const resolvedToolChoice =
    options?.toolChoice !== undefined ? options.toolChoice : defaultToolChoice;

  const modelId = options?.modelId ?? CHAT_MODEL_ID;
  const modelName = modelId.replace('openrouter/', '');

  const modalities = openRouterImageGenModalities(modelId, options?.modelCapabilities);
  const body: Record<string, unknown> = {
    model: modelName,
    messages: sanitizedMessages,
    stream: true,
    ...(tools && !modalities
      ? { tools, tool_choice: resolvedToolChoice, parallel_tool_calls: true }
      : {}),
    max_tokens: options?.maxTokens ?? MODEL_PARAMS.max_tokens,
    temperature: MODEL_PARAMS.temperature,
    top_p: MODEL_PARAMS.top_p,
    ...(modalities ? { modalities } : {}),
  };

  const t0 = Date.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: options?.abortSignal,
  });

  const dt = Date.now() - t0;
  console.log(
    `[OpenRouter] ${timingLabel ?? 'stream'} status=${res.status} model=${modelName} duration_ms=${dt}`,
  );

  if (!res.ok || !res.body) {
    const text = await safeReadText(res);
    throw new Error(`OpenRouter streaming error: ${res.status} ${text}`);
  }

  return (res.body as ReadableStream<Uint8Array>)
    .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
    .pipeThrough(createGroqStreamTransform());
}

async function getGroqResponseOpenRouter(
  messages: GroqMessage[],
  env: AiClientEnv,
  options?: GetGroqResponseOptions,
): Promise<string> {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing');

  const modelId = options?.modelId ?? CHAT_MODEL_ID;
  const modelName = modelId.replace('openrouter/', '');

  const modalities = openRouterImageGenModalities(modelId);
  const body: Record<string, unknown> = {
    model: modelName,
    messages: sanitizeHarmonyHistory(messages),
    stream: false,
    max_tokens: options?.max_tokens ?? MODEL_PARAMS.max_tokens,
    temperature: MODEL_PARAMS.temperature,
    top_p: MODEL_PARAMS.top_p,
    ...(modalities ? { modalities } : {}),
  };

  const t0 = Date.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const dt = Date.now() - t0;
  console.log(
    `[OpenRouter] getGroqResponse model=${modelName} status=${res.status} duration_ms=${dt}`,
  );

  if (!res.ok) {
    const text = await safeReadText(res);
    throw new Error(`OpenRouter error: ${res.status} ${text}`);
  }

  const json: any = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? '';
  return content;
}

async function routedGetGroqResponse(
  messages: GroqMessage[],
  env: AiClientEnv,
  options?: GetGroqResponseOptions,
): Promise<string> {
  const modelId = options?.modelId ?? CHAT_MODEL_ID;
  if (isOpenRouterModelId(modelId)) {
    return getGroqResponseOpenRouter(messages, env, { ...options, modelId });
  }
  if (isGatewayModelId(modelId)) {
    return getGroqResponseViaGateway(messages, env, { ...options, modelId });
  }
  return getGroqResponseWorkersAi(messages, env, { ...options, modelId });
}

async function routedStreamGroqEvents(
  messages: GroqMessage[],
  env: AiClientEnv,
  tools?: GroqToolCallDefinition[],
  sessionId?: string,
  timingLabel?: string,
  options?: StreamGroqEventsOptions,
): Promise<ReadableStream<GroqStreamEvent>> {
  const modelId = options?.modelId ?? CHAT_MODEL_ID;
  if (isOpenRouterModelId(modelId)) {
    return streamGroqEventsOpenRouter(messages, env, tools, sessionId, timingLabel, {
      ...options,
      modelId,
    });
  }
  if (isGatewayModelId(modelId)) {
    return streamGroqEventsViaGateway(messages, env, tools, sessionId, timingLabel, {
      ...options,
      modelId,
    });
  }
  return streamGroqEventsWorkersAi(messages, env, tools, sessionId, timingLabel, { ...options, modelId });
}

/**
 * Rozstrzyga wariant modelu na podstawie nagłówka `X-Epir-Model-Variant`.
 * ZWRACA `null` (użyj default), gdy:
 * - brak nagłówka,
 * - brak / zły `Authorization: Bearer` dopasowany do `EPIR_OPERATOR_PANEL_SECRET`,
 * - variant wymaga multimodal, ale request ma obraz (`hasImage: true`), a variant `multimodal: false`,
 * - klucz nie pasuje do żadnego wariantu (defensywnie silent-fallback).
 *
 * UWAGA bezpieczeństwo: nagłówek DZIAŁA wyłącznie z Bearer zgodnym z sekretem panelu operatorskiego (`wrangler secret put EPIR_OPERATOR_PANEL_SECRET`).
 * Dla ruchu buyer-facing (bez sekretu) zawsze zwracamy `null` → default model.
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i += 1) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}

export function resolveAdminModelVariantFromHeaders(
  headers: {
    get(name: string): string | null;
  },
  env: { EPIR_OPERATOR_PANEL_SECRET?: string },
  context: { hasImage?: boolean } = {},
): ModelCapabilities | null {
  const raw = headers.get('x-epir-model-variant') || headers.get('X-Epir-Model-Variant');
  if (!raw) return null;
  const variantKey = raw.trim();
  if (!variantKey) return null;

  const configured = env.EPIR_OPERATOR_PANEL_SECRET?.trim() ?? '';
  if (!configured) return null;

  const rawAuth = headers.get('Authorization') ?? headers.get('authorization');
  const m = /^Bearer\s+(.+)$/i.exec((rawAuth ?? '').trim());
  const bearer = m?.[1]?.trim();
  if (!bearer || !timingSafeEqualStrings(bearer, configured)) return null;

  if (!Object.hasOwn(MODEL_VARIANTS, variantKey)) return null;
  const variant = MODEL_VARIANTS[variantKey as ModelVariantKey];

  if (context.hasImage && !variant.multimodal) {
    console.warn(
      `[resolveAdminModelVariantFromHeaders] variant=${variantKey} is not multimodal; ignoring override because request has image`,
    );
    return null;
  }
  return variant;
}

function operatorBearerMatchesPanelSecret(
  headers: { get(name: string): string | null },
  env: { EPIR_OPERATOR_PANEL_SECRET?: string },
): boolean {
  const configured = env.EPIR_OPERATOR_PANEL_SECRET?.trim() ?? '';
  if (!configured) return false;
  const rawAuth = headers.get('Authorization') ?? headers.get('authorization');
  const m = /^Bearer\s+(.+)$/i.exec((rawAuth ?? '').trim());
  const bearer = m?.[1]?.trim();
  return Boolean(bearer && timingSafeEqualStrings(bearer, configured));
}

/**
 * Dowolny slug z katalogu OpenRouter (po walidacji cache) — tylko z Bearer panelu operatora.
 */
export async function resolveDynamicOpenRouterModelFromHeaders(
  headers: { get(name: string): string | null },
  env: { EPIR_OPERATOR_PANEL_SECRET?: string; OPENROUTER_API_KEY?: string },
  context: { hasImage?: boolean } = {},
): Promise<ModelCapabilities | null> {
  const raw =
    headers.get('x-epir-openrouter-model') ?? headers.get('X-Epir-OpenRouter-Model');
  if (!raw?.trim()) return null;
  const slug = raw.trim();
  if (!isValidOpenRouterModelId(slug)) return null;
  if (!operatorBearerMatchesPanelSecret(headers, env)) return null;

  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  const catalog = await fetchOpenRouterCatalog(apiKey);
  const entry = findCatalogEntry(catalog, slug);
  if (!entry) return null;

  const cap = catalogEntryToCapabilities(entry);
  if (context.hasImage && !cap.multimodal) {
    console.warn(
      `[resolveDynamicOpenRouterModelFromHeaders] model=${slug} is not multimodal; ignoring override`,
    );
    return null;
  }
  return cap;
}

/** Preset `or_*` ma pierwszeństwo; potem dynamiczny slug z katalogu OR. */
export async function resolveOperatorModelOverride(
  headers: { get(name: string): string | null },
  env: { EPIR_OPERATOR_PANEL_SECRET?: string; OPENROUTER_API_KEY?: string },
  context: { hasImage?: boolean } = {},
): Promise<ModelCapabilities | null> {
  const variant = resolveAdminModelVariantFromHeaders(headers, env, context);
  if (variant) return variant;
  return resolveDynamicOpenRouterModelFromHeaders(headers, env, context);
}

export const __test = {
  createGroqStreamTransform,
  normalizeWorkersAiSessionId,
  resolveAdminModelVariantFromHeaders,
  resolveDynamicOpenRouterModelFromHeaders,
  resolveOperatorModelOverride,
};

/** Opcje `getGroqResponse` (nie-streaming, `env.AI.run`). */
export type GetGroqResponseOptions = {
  max_tokens?: number;
  sessionId?: string;
  modelId?: string;
  timingLabel?: string;
  /**
   * Ścieżka pamięci (kolejka / person-memory): pusta odpowiedź → `""`, `console.warn` zamiast throw + `console.error`.
   */
  forMemory?: boolean;
};

async function getGroqResponseWorkersAi(
  messages: GroqMessage[],
  env: AiClientEnv,
  options?: GetGroqResponseOptions,
): Promise<string> {
  const ai = requireAi(env);
  const startTime = Date.now();
  const resolvedModel = options?.modelId ?? CHAT_MODEL_ID;
  const forMemory = options?.forMemory === true;
  const sanitizedMessages = sanitizeHarmonyHistory(messages);

  // Nie doklejaj szablonów typu `User input: "..."` / `Context:` ani drugiego „debugowego”
  // system/user — tylko `messages` przekazane z callera. `mapMessageForWorkersAI` to wyłącznie
  // mapowanie pól API Workers AI (null/string/części multimodal), nie sklejanie treści w jeden string.

  try {
    const result = (await ai.run(
      resolvedModel,
      {
        messages: sanitizedMessages.map(mapMessageForWorkersAI),
        max_tokens: options?.max_tokens ?? MODEL_PARAMS.max_tokens,
        temperature: MODEL_PARAMS.temperature,
        top_p: MODEL_PARAMS.top_p,
      },
      workersAiRunOptions(options?.sessionId),
    )) as Record<string, unknown> & { response?: string };

    const content = extractTextFromAiResult(result, { memoryReasoningFallback: forMemory });
    if (!content) {
      if (result && typeof result === 'object') {
        const elapsed = Date.now() - startTime;
        const emptyMeta = {
          elapsed_ms: elapsed,
          model: resolvedModel,
          ...describeEmptyAiResult(result),
        };
        if (forMemory) {
          console.warn(
            '[getGroqResponse][memory] empty body',
            elapsed,
            'ms',
            JSON.stringify(emptyMeta),
          );
          return '';
        }
        console.warn(
          '[getGroqResponse] unexpected result keys',
          elapsed,
          'ms',
          JSON.stringify(Object.keys(result)),
        );
        console.warn(
          '[getGroqResponse] empty_response_meta',
          JSON.stringify(emptyMeta),
        );
      } else if (forMemory) {
        console.warn('[getGroqResponse][memory] empty non-object result', { model: resolvedModel });
        return '';
      }
      throw new Error('Workers AI returned an empty or invalid response');
    }

    if (!forMemory) {
      console.log(
        `[Workers AI] getGroqResponse total_ms=${Date.now() - startTime} model=${resolvedModel}`,
      );
    }
    return String(content);
  } catch (e) {
    if (forMemory) {
      console.warn(
        '[getGroqResponse][memory] failed',
        Date.now() - startTime,
        'ms',
        stringifyForLog(e),
      );
      return '';
    }
    console.error('[getGroqResponse] failed', Date.now() - startTime, 'ms', stringifyForLog(e));
    throw e;
  }
}

export async function getGroqResponse(
  messages: GroqMessage[],
  env: AiClientEnv,
  options?: GetGroqResponseOptions,
): Promise<string> {
  return routedGetGroqResponse(messages, env, options);
}

export async function getGroqResponseViaGateway(
  messages: GroqMessage[],
  env: AiClientEnv,
  options?: GetGroqResponseOptions,
): Promise<string> {
  const startTime = Date.now();
  const resolvedModel = options?.modelId ?? MODEL_VARIANTS.default.id;
  const forMemory = options?.forMemory === true;
  const sanitizedMessages = sanitizeHarmonyHistory(messages);

  const body: GatewayCompatBody = {
    model: resolvedModel,
    messages: sanitizedMessages,
    stream: false,
    max_tokens: options?.max_tokens ?? MODEL_PARAMS.max_tokens,
    temperature: MODEL_PARAMS.temperature,
    top_p: MODEL_PARAMS.top_p,
    include_reasoning: MODEL_PARAMS.include_reasoning,
    reasoning_effort: MODEL_PARAMS.reasoning_effort,
  };

  let res: Response;
  try {
    res = await callGatewayCompat(env, body, {
      timingLabel: options?.timingLabel ?? 'getGroqResponseViaGateway',
    });
  } catch (err) {
    console.error('[AI Gateway] getGroqResponseViaGateway network_error', err);
    throw err;
  }

  if (!res.ok) {
    const text = await safeReadText(res);
    console.error(
      `[AI Gateway] getGroqResponseViaGateway http_error status=${res.status} body=${text}`,
    );
    throw new Error(`AI Gateway error: ${res.status}`);
  }

  type CompatChoice = {
    message?: { content?: string | null };
  };
  type CompatResponse = {
    choices?: CompatChoice[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      cached_tokens?: number;
    };
  };

  let json: CompatResponse;
  try {
    json = (await res.json()) as CompatResponse;
  } catch (err) {
    console.error('[AI Gateway] getGroqResponseViaGateway invalid_json', err);
    throw err;
  }

  const content =
    json.choices?.[0]?.message?.content && typeof json.choices[0].message.content === 'string'
      ? json.choices[0].message.content
      : '';

  if (!content) {
    console.warn('[AI Gateway] getGroqResponseViaGateway empty_content', json);
    throw new Error('AI Gateway returned empty content');
  }

  if (!forMemory) {
    const usage = json.usage;
    console.log(
      `[AI Gateway] getGroqResponseViaGateway total_ms=${Date.now() - startTime} model=${resolvedModel} prompt_tokens=${usage?.prompt_tokens ?? 0} completion_tokens=${usage?.completion_tokens ?? 0}`,
    );
  }

  return content;
}
