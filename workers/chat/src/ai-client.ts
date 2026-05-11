/**
 * worker/src/ai-client.ts
 * Ujednolicony klient do komunikacji z Workers AI.
 * Nazwy typów/historycznych funkcji pozostają dla kompatybilności z istniejącym kodem.
 */

import {
  CHAT_MODEL_ID,
  MODEL_PARAMS,
  MODEL_VARIANTS,
  type ModelCapabilities,
  type ModelVariantKey,
} from './config/model-params';

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
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
};

export type GroqStreamEvent =
  | { type: 'text'; delta: string }
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
    }
  | { type: 'done'; finish_reason?: string };

type AIBinding = {
  run: (
    model: string,
    input: unknown,
    options?: { headers?: Record<string, string> },
  ) => Promise<unknown>;
};

interface Env {
  AI?: AIBinding;
  CF_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  /** Bearer dla nagłówka `cf-aig-authorization` (AI Gateway); `wrangler secret put AI_GATEWAY_TOKEN`. */
  AI_GATEWAY_TOKEN?: string;
}

export function shouldUseWorkersAi(env: Env): boolean {
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
    if (out[i].role === 'user' && typeof out[i].content === 'string') {
      const text = out[i].content ?? '';
      const parts: KimiContentPart[] = [];
      if (text.trim()) parts.push({ type: 'text', text: text.trim() });
      parts.push({ type: 'image_url', image_url: { url: imageDataUri } });
      out[i] = { ...out[i], content: parts };
      break;
    }
  }
  return out;
}

function requireAi(env: Env): AIBinding {
  if (!env.AI?.run) {
    throw new Error('Workers AI binding missing. Add [ai] binding in wrangler.toml.');
  }
  return env.AI;
}

async function callGatewayCompat(
  env: Env,
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
  console.log('[DEBUG] URL:', url);
  console.log('[DEBUG] groqApiKey (first 8):', groqApiKey?.slice(0, 8));
  console.log('[DEBUG] gatewayToken (first 8):', gatewayToken?.slice(0, 8));
  console.log('[DEBUG] model:', body.model);
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
  env: Env,
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
  env: Env,
  sessionId?: string,
): Promise<ReadableStream<string>> {
  let buffer = '';
  const stream = await runModelStream(messages, env, {
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

    const deltaText = choice?.delta?.content;
    const msgContent = choice?.message?.content;
    const text =
      typeof deltaText === 'string' ? deltaText : typeof msgContent === 'string' ? msgContent : '';
    if (text) controller.enqueue({ type: 'text', delta: text });

    const toolCalls = choice?.delta?.tool_calls || choice?.message?.tool_calls;
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
      controller.enqueue({
        type: 'usage',
        prompt_tokens: p,
        completion_tokens: c,
        cached_tokens: cachedNormalized,
      });
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
  /** Override `max_tokens` dla tej tury streamu. */
  maxTokens?: number;
  /** Anulowanie żądania (np. ścieżka AI Gateway); Workers AI `runModelStream` na razie tego nie używa. */
  abortSignal?: AbortSignal;
};

async function streamGroqEventsWorkersAi(
  messages: GroqMessage[],
  env: Env,
  tools?: GroqToolCallDefinition[],
  sessionId?: string,
  timingLabel?: string,
  options?: StreamGroqEventsOptions,
): Promise<ReadableStream<GroqStreamEvent>> {
  const defaultToolChoice = tools && tools.length > 0 ? 'auto' : undefined;
  const resolvedToolChoice =
    options?.toolChoice !== undefined ? options.toolChoice : defaultToolChoice;

  const stream = await runModelStream(messages, env, {
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
  env: Env,
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
  env: Env,
  tools?: GroqToolCallDefinition[],
  sessionId?: string,
  timingLabel?: string,
  options?: StreamGroqEventsOptions,
): Promise<ReadableStream<GroqStreamEvent>> {
  void sessionId;

  const defaultToolChoice = tools && tools.length > 0 ? 'auto' : undefined;
  const resolvedToolChoice =
    options?.toolChoice !== undefined ? options.toolChoice : defaultToolChoice;

  const resolvedModel = options?.modelId ?? MODEL_VARIANTS.scout_17b.id;

  const body: GatewayCompatBody = {
    model: resolvedModel,
    messages,
    stream: true,
    tools,
    tool_choice: resolvedToolChoice,
    max_tokens: options?.maxTokens ?? MODEL_PARAMS.max_tokens,
    temperature: MODEL_PARAMS.temperature,
    top_p: MODEL_PARAMS.top_p,
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

  const byteStream = res.body as ReadableStream<Uint8Array>;
  const [debugStream, parseStream] = byteStream.tee();

  void (async () => {
    const reader = debugStream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        console.log('[DEBUG-CHUNK]', chunk.slice(0, 200));
      }
    } catch (err) {
      console.warn('[DEBUG-CHUNK] read_error', stringifyForLog(err));
    } finally {
      reader.releaseLock();
    }
  })();

  return parseStream
    .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
    .pipeThrough(createGroqStreamTransform());
}

function isGatewayModelId(modelId: string): boolean {
  // Na razie rozróżniamy po prefixie providera, możesz później rozszerzyć
  return modelId.startsWith('groq/');
}

async function routedGetGroqResponse(
  messages: GroqMessage[],
  env: Env,
  options?: GetGroqResponseOptions,
): Promise<string> {
  const modelId = options?.modelId ?? CHAT_MODEL_ID;
  if (isGatewayModelId(modelId)) {
    return getGroqResponseViaGateway(messages, env, { ...options, modelId });
  }
  return getGroqResponseWorkersAi(messages, env, { ...options, modelId });
}

async function routedStreamGroqEvents(
  messages: GroqMessage[],
  env: Env,
  tools?: GroqToolCallDefinition[],
  sessionId?: string,
  timingLabel?: string,
  options?: StreamGroqEventsOptions,
): Promise<ReadableStream<GroqStreamEvent>> {
  const modelId = options?.modelId ?? CHAT_MODEL_ID;
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
 * - brak / zły `ADMIN_KEY` bearer token,
 * - variant wymaga multimodal, ale request ma obraz (`hasImage: true`), a variant `multimodal: false`,
 * - klucz nie pasuje do żadnego wariantu (defensywnie silent-fallback).
 *
 * Caller (index.ts) dostaje albo `ModelCapabilities` albo `null` i decyduje co zrobić.
 *
 * UWAGA bezpieczeństwo: nagłówek DZIAŁA WYŁĄCZNIE z poprawnym `Authorization: Bearer ${ADMIN_KEY}`.
 * Dla ruchu buyer-facing (bez admin tokenu) zawsze zwracamy `null` → default model.
 */
export function resolveAdminModelVariantFromHeaders(
  headers: {
    get(name: string): string | null;
  },
  env: { ADMIN_KEY?: string },
  context: { hasImage?: boolean } = {},
): ModelCapabilities | null {
  const raw = headers.get('x-epir-model-variant') || headers.get('X-Epir-Model-Variant');
  if (!raw) return null;
  const variantKey = raw.trim();
  if (!variantKey) return null;

  const authHeader = headers.get('authorization') || headers.get('Authorization');
  const adminKey = env.ADMIN_KEY;
  if (!adminKey || !authHeader) return null;
  const expected = `Bearer ${adminKey}`;
  if (authHeader.trim() !== expected) return null;

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

export const __test = {
  createGroqStreamTransform,
  normalizeWorkersAiSessionId,
  resolveAdminModelVariantFromHeaders,
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
  env: Env,
  options?: GetGroqResponseOptions,
): Promise<string> {
  const ai = requireAi(env);
  const startTime = Date.now();
  const resolvedModel = options?.modelId ?? CHAT_MODEL_ID;
  const forMemory = options?.forMemory === true;

  // Nie doklejaj szablonów typu `User input: "..."` / `Context:` ani drugiego „debugowego”
  // system/user — tylko `messages` przekazane z callera. `mapMessageForWorkersAI` to wyłącznie
  // mapowanie pól API Workers AI (null/string/części multimodal), nie sklejanie treści w jeden string.

  try {
    const result = (await ai.run(
      resolvedModel,
      {
        messages: messages.map(mapMessageForWorkersAI),
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
  env: Env,
  options?: GetGroqResponseOptions,
): Promise<string> {
  return routedGetGroqResponse(messages, env, options);
}

export async function getGroqResponseViaGateway(
  messages: GroqMessage[],
  env: Env,
  options?: GetGroqResponseOptions,
): Promise<string> {
  const startTime = Date.now();
  const resolvedModel = options?.modelId ?? MODEL_VARIANTS.scout_17b.id;
  const forMemory = options?.forMemory === true;

  const body: GatewayCompatBody = {
    model: resolvedModel,
    messages,
    stream: false,
    max_tokens: options?.max_tokens ?? MODEL_PARAMS.max_tokens,
    temperature: MODEL_PARAMS.temperature,
    top_p: MODEL_PARAMS.top_p,
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
