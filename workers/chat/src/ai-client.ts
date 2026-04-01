/**
 * worker/src/ai-client.ts
 * Ujednolicony klient do komunikacji z API Groq.
 * Zastępuje redundantne pliki `groq.ts` i `cloudflare-ai.ts`.
 * Odpowiedzialność: Wyłącznie obsługa żądań HTTP (streaming i non-streaming) do API.
 * NIE zawiera logiki biznesowej, budowania promptów ani promptów systemowych.
 */

import { GROQ_MODEL_ID, WORKERS_AI_MODEL_ID, WORKERS_AI_VISION_MODEL_ID, MODEL_PARAMS, GROQ_API_URL } from './config/model-params';

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

export type GroqMessage = { 
  role: 'system' | 'user' | 'assistant' | 'tool'; 
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;  // Opcjonalne dla wiadomości 'tool'
  name?: string;           // Opcjonalne dla wiadomości 'tool'
};

export type GroqStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: GroqToolCall }
  | { type: 'usage'; prompt_tokens: number; completion_tokens: number }
  | { type: 'done'; finish_reason?: string };

/** AI binding - Workers AI (Cloudflare) */
type AIBinding = { run: (model: string, input: unknown, options?: unknown) => Promise<unknown> };

/**
 * Interfejs dla środowiska Cloudflare Worker.
 */
interface Env {
  GROQ_API_KEY: string;
  GROQ_PRICE_INPUT_PER_M?: number;   // np. 0.20
  GROQ_PRICE_OUTPUT_PER_M?: number;  // np. 0.30
  /** AI Gateway - gdy ustawione, requesty idą przez gateway (cache, analytics, fallback) */
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_NAME?: string;
  /** A/B test: gdy '1' lub 'true', używaj Workers AI zamiast Groq */
  USE_WORKERS_AI?: string;
  /** Cloudflare Workers AI binding */
  AI?: AIBinding;
}

function useWorkersAI(env: Env): boolean {
  const v = env.USE_WORKERS_AI?.trim().toLowerCase();
  return (v === '1' || v === 'true') && !!env.AI?.run;
}

function getApiUrl(env: Env): string {
  const accountId = env.AI_GATEWAY_ACCOUNT_ID?.trim();
  const gatewayName = env.AI_GATEWAY_NAME?.trim();
  if (accountId && gatewayName) {
    return `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/groq/chat/completions`;
  }
  return GROQ_API_URL;
}

/** Model ID dla requestu - z prefiksem groq/ gdy używamy AI Gateway compat */
function getModelForRequest(env: Env): string {
  const accountId = env.AI_GATEWAY_ACCOUNT_ID?.trim();
  const gatewayName = env.AI_GATEWAY_NAME?.trim();
  if (accountId && gatewayName) {
    return `groq/${GROQ_MODEL_ID}`;
  }
  return GROQ_MODEL_ID;
}

/**
 * Parametry wywołania API Groq.
 */
interface GroqPayload {
  model: string;
  messages: GroqMessage[];
  stream: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  // Dla streamingu: poproś o usage w strumieniu (zgodne z OpenAI-compatible API)
  stream_options?: { include_usage?: boolean };
  tools?: GroqToolCallDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

/**
 * Wykonuje streamingowe zapytanie do Groq i zwraca ReadableStream z tekstem.
 * @param messages - Tablica wiadomości (system, user, assistant).
 * @param model - Nazwa modelu (np. 'llama3-70b-8192').
 * @param env - Środowisko Workera (dla API key).
 * @returns ReadableStream<string> - Strumień fragmentów tekstu (delta).
 */
export async function streamGroqResponse(
  messages: GroqMessage[],
  env: Env
): Promise<ReadableStream<string>> {
  if (useWorkersAI(env)) {
    const stream = await env.AI!.run(WORKERS_AI_MODEL_ID, {
      messages: messages.map((m) => ({ role: m.role, content: m.content ?? '' })),
      stream: true,
      max_tokens: MODEL_PARAMS.max_tokens,
    }) as ReadableStream<Uint8Array>;
    if (stream && typeof stream.getReader === 'function') {
      let buf = '';
      return stream
        .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
        .pipeThrough(
        new TransformStream<string, string>({
          transform(chunk, controller) {
            buf += chunk;
            const lines = buf.split(/\r?\n/);
            buf = lines.pop() ?? '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') continue;
              const prefix = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
              try {
                const parsed = JSON.parse(prefix);
                const content = parsed?.choices?.[0]?.delta?.content ?? parsed?.choices?.[0]?.message?.content;
                if (typeof content === 'string' && content) controller.enqueue(content);
              } catch (_) {}
            }
          },
          flush(controller) {
            if (buf.trim() && buf.trim() !== 'data: [DONE]') {
              const prefix = buf.trim().startsWith('data:') ? buf.trim().slice(5).trim() : buf.trim();
              try {
                const parsed = JSON.parse(prefix);
                const content = parsed?.choices?.[0]?.delta?.content ?? parsed?.choices?.[0]?.message?.content;
                if (typeof content === 'string' && content) controller.enqueue(content);
              } catch (_) {}
            }
          }
        })
      );
    }
  }

  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Missing GROQ_API_KEY secret');

  const payload: GroqPayload = {
    model: getModelForRequest(env),
    messages,
    stream: true,
    temperature: MODEL_PARAMS.temperature,
    max_tokens: MODEL_PARAMS.max_tokens,
    top_p: MODEL_PARAMS.top_p,
    stream_options: MODEL_PARAMS.stream_options,
  };

  const res = await fetch(getApiUrl(env), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    const errorBody = await res.text().catch(() => '<no body>');
    throw new Error(`Groq API error (${res.status}): ${errorBody}`);
  }

  // Parsuj SSE stream z Groq i wyciągaj tylko fragmenty tekstu (delta content)
  // Dodatkowo: wyłapuj usage i loguj koszt (jeśli dostępne stawki w env)
  let buffer = '';
  let usagePrompt = 0;
  let usageCompletion = 0;
  let sawUsage = false;
  const textStream = res.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream<string, string>({
        start() {
          buffer = '';
        },
        transform(chunk, controller) {
          buffer += chunk;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]' || trimmed === '[DONE]') continue;
            
            const prefix = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
            try {
              const parsed = JSON.parse(prefix);
              const content = parsed?.choices?.[0]?.delta?.content;
              const messageContent = parsed?.choices?.[0]?.message?.content;
              const usage = parsed?.usage;
              
              if (typeof content === 'string' && content) {
                controller.enqueue(content);
              } else if (typeof messageContent === 'string' && messageContent) {
                controller.enqueue(messageContent);
              } else if (usage && typeof usage === 'object') {
                // Zapisz usage do logowania przy flush
                const p = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
                const c = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
                if (!Number.isNaN(p)) usagePrompt = p;
                if (!Number.isNaN(c)) usageCompletion = c;
                sawUsage = true;
              }
            } catch (e) {
              // Ignoruj nieparsowalne fragmenty
            }
          }
        },
        flush(controller) {
          if (buffer.trim() && buffer.trim() !== 'data: [DONE]' && buffer.trim() !== '[DONE]') {
            const trimmed = buffer.trim();
            const prefix = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
            try {
              const parsed = JSON.parse(prefix);
              const content = parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.message?.content;
              if (typeof content === 'string' && content) {
                controller.enqueue(content);
              }
            } catch (e) {
              // Ignoruj błędy przy finalnym flushowaniu
            }
          }
          // Po zakończeniu streamu — zaloguj usage i opcjonalnie koszt
          if (sawUsage) {
            try {
              const inM = env.GROQ_PRICE_INPUT_PER_M;
              const outM = env.GROQ_PRICE_OUTPUT_PER_M;
              if (typeof inM === 'number' && typeof outM === 'number') {
                const costIn = (usagePrompt / 1_000_000) * inM;
                const costOut = (usageCompletion / 1_000_000) * outM;
                const total = costIn + costOut;
                console.log(`[Groq][stream] usage: prompt=${usagePrompt}, completion=${usageCompletion}, cost≈$${total.toFixed(6)} (in=$${costIn.toFixed(6)}, out=$${costOut.toFixed(6)})`);
              } else {
                console.log(`[Groq][stream] usage: prompt=${usagePrompt}, completion=${usageCompletion}`);
              }
            } catch {}
          }
        }
      })
    );

  return textStream;
}

function createGroqStreamTransform(): TransformStream<string, GroqStreamEvent> {
  let buffer = '';
  const toolBuffers = new Map<string, GroqToolCall>();

  return new TransformStream<string, GroqStreamEvent>({
    start() {
      buffer = '';
      toolBuffers.clear();
    },
    transform(chunk, controller) {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (line === 'data: [DONE]' || line === '[DONE]') {
          controller.enqueue({ type: 'done', finish_reason: 'stop' });
          continue;
        }
        const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
        let parsed: any = null;
        try {
          parsed = JSON.parse(payload);
        } catch (_e) {
          continue;
        }

        const choice = parsed?.choices?.[0];
        if (choice?.finish_reason) {
          controller.enqueue({ type: 'done', finish_reason: choice.finish_reason });
        }

        const deltaText = choice?.delta?.content;
        const msgContent = choice?.message?.content;
        const text = typeof deltaText === 'string' ? deltaText : (typeof msgContent === 'string' ? msgContent : '');
        if (text) {
          controller.enqueue({ type: 'text', delta: text });
        }

        const toolCalls = choice?.delta?.tool_calls || choice?.message?.tool_calls;
        if (Array.isArray(toolCalls)) {
          for (const call of toolCalls) {
            const id = call.id || `call_${toolBuffers.size + 1}`;
            const name = call.function?.name || toolBuffers.get(id)?.name || '';
            const argDelta = typeof call.function?.arguments === 'string' ? call.function.arguments : '';
            const existing = toolBuffers.get(id) || { id, name, arguments: '' };
            const merged: GroqToolCall = {
              id,
              name: name || existing.name,
              arguments: `${existing.arguments}${argDelta || ''}`,
            };
            toolBuffers.set(id, merged);
            controller.enqueue({ type: 'tool_call', call: merged });
          }
        }

        const usage = parsed?.usage;
        if (usage && typeof usage === 'object') {
          const p = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
          const c = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
          controller.enqueue({ type: 'usage', prompt_tokens: p, completion_tokens: c });
        }
      }
    },
    flush(controller) {
      if (!buffer.trim()) return;
      const payload = buffer.trim().startsWith('data:') ? buffer.trim().slice(5).trim() : buffer.trim();
      try {
        const parsed = JSON.parse(payload);
        const choice = parsed?.choices?.[0];
        if (choice?.finish_reason) {
          controller.enqueue({ type: 'done', finish_reason: choice.finish_reason });
        }
        const deltaText = choice?.delta?.content;
        const msgContent = choice?.message?.content;
        const text = typeof deltaText === 'string' ? deltaText : (typeof msgContent === 'string' ? msgContent : '');
        if (text) {
          controller.enqueue({ type: 'text', delta: text });
        }
        const toolCalls = choice?.delta?.tool_calls || choice?.message?.tool_calls;
        if (Array.isArray(toolCalls)) {
          for (const call of toolCalls) {
            const id = call.id || `call_${toolBuffers.size + 1}`;
            const name = call.function?.name || toolBuffers.get(id)?.name || '';
            const argDelta = typeof call.function?.arguments === 'string' ? call.function.arguments : '';
            const existing = toolBuffers.get(id) || { id, name, arguments: '' };
            const merged: GroqToolCall = {
              id,
              name: name || existing.name,
              arguments: `${existing.arguments}${argDelta || ''}`,
            };
            toolBuffers.set(id, merged);
            controller.enqueue({ type: 'tool_call', call: merged });
          }
        }
        const usage = parsed?.usage;
        if (usage && typeof usage === 'object') {
          const p = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
          const c = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
          controller.enqueue({ type: 'usage', prompt_tokens: p, completion_tokens: c });
        }
      } catch (_e) {
        // ignore
      }
    },
  });
}

/**
 * Start a Groq streaming request and return a stream of GroqStreamEvent objects.
 * Consumers can handle text vs tool_call events as needed.
 */
export async function streamGroqEvents(
  messages: GroqMessage[],
  env: Env,
  tools?: GroqToolCallDefinition[]
): Promise<ReadableStream<GroqStreamEvent>> {
  if (useWorkersAI(env)) {
    const stream = await env.AI!.run(WORKERS_AI_MODEL_ID, {
      messages: messages.map((m) => ({ role: m.role, content: m.content ?? '' })),
      stream: true,
      max_tokens: MODEL_PARAMS.max_tokens,
      tools: tools,
    }) as ReadableStream<Uint8Array>;
    if (stream && typeof stream.getReader === 'function') {
      return stream
        .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
        .pipeThrough(createGroqStreamTransform());
    }
  }

  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Missing GROQ_API_KEY secret');

  const payload: GroqPayload = {
    model: getModelForRequest(env),
    messages,
    stream: true,
    temperature: MODEL_PARAMS.temperature,
    max_tokens: MODEL_PARAMS.max_tokens,
    top_p: MODEL_PARAMS.top_p,
    stream_options: MODEL_PARAMS.stream_options,
    tools,
    tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
  };

  const res = await fetch(getApiUrl(env), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    const errorBody = await res.text().catch(() => '<no body>');
    throw new Error(`Groq API error (${res.status}): ${errorBody}`);
  }

  return res.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(createGroqStreamTransform());
}

/**
 * Streamuje odpowiedź z modelu vision (Workers AI).
 * Używane gdy wiadomość zawiera image_base64.
 * Model vision NIE obsługuje tool_calls – zwraca tylko tekst.
 *
 * Uwaga: Przy pierwszym użyciu @cf/meta/llama-3.2-11b-vision-instruct należy
 * zaakceptować licencję Meta: wyślij request z prompt: "agree".
 *
 * @param messages - Wiadomości (system + user z tekstem)
 * @param imageDataUri - Obraz w formacie data:image/...;base64,...
 * @param env - Środowisko (wymagane: env.AI)
 * @returns ReadableStream<GroqStreamEvent> - tylko type: 'text' i 'done'
 */
export async function streamVisionEvents(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  imageDataUri: string,
  env: Env
): Promise<ReadableStream<GroqStreamEvent>> {
  if (!env.AI?.run) {
    throw new Error('Vision requires Workers AI binding (env.AI). Set [ai] binding in wrangler.toml.');
  }
  const stream = (await env.AI.run(WORKERS_AI_VISION_MODEL_ID, {
    messages,
    image: imageDataUri,
    stream: true,
    max_tokens: MODEL_PARAMS.max_tokens,
    temperature: MODEL_PARAMS.temperature,
  })) as ReadableStream<Uint8Array>;
  if (!stream || typeof stream.getReader !== 'function') {
    throw new Error('Workers AI vision did not return a stream');
  }
  return stream
    .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
    .pipeThrough(createGroqStreamTransform());
}

// Expose internal helpers for unit tests only
export const __test = { createGroqStreamTransform };

/**
 * Wykonuje standardowe (non-streaming) zapytanie do Groq.
 * @param messages - Tablica wiadomości (system, user, assistant).
 * @param model - Nazwa modelu (np. 'llama3-70b-8192').
 * @param env - Środowisko Workera (dla API key).
 * @returns Pełna odpowiedź tekstowa (content) od modelu.
 */
export async function getGroqResponse(
  messages: GroqMessage[],
  env: Env,
  options?: { max_tokens?: number },
): Promise<string> {
  const maxOut = options?.max_tokens ?? MODEL_PARAMS.max_tokens;
  if (useWorkersAI(env)) {
    const result = await env.AI!.run(WORKERS_AI_MODEL_ID, {
      messages: messages.map((m) => ({ role: m.role, content: m.content ?? '' })),
      max_tokens: maxOut,
    }) as { response?: string };
    const content = result?.response;
    if (!content) throw new Error('Workers AI returned empty response');
    return String(content);
  }

  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Missing GROQ_API_KEY secret');

  const payload: GroqPayload = {
    model: getModelForRequest(env),
    messages,
    stream: false,
    temperature: MODEL_PARAMS.temperature,
    max_tokens: maxOut,
    top_p: MODEL_PARAMS.top_p,
  };

  const res = await fetch(getApiUrl(env), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '<no body>');
    throw new Error(`Groq API error (${res.status}): ${errorBody}`);
  }

  const json: any = await res.json().catch(() => null);
  const content = json?.choices?.[0]?.message?.content;

  // Logowanie usage + koszt (jeśli dostępne)
  try {
    const usage = json?.usage || {};
    const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
    const completion = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
    if (prompt || completion) {
      const inM = env.GROQ_PRICE_INPUT_PER_M;
      const outM = env.GROQ_PRICE_OUTPUT_PER_M;
      if (typeof inM === 'number' && typeof outM === 'number') {
        const costIn = (prompt / 1_000_000) * inM;
        const costOut = (completion / 1_000_000) * outM;
        const total = costIn + costOut;
        console.log(`[Groq][resp] usage: prompt=${prompt}, completion=${completion}, cost≈$${total.toFixed(6)} (in=$${costIn.toFixed(6)}, out=$${costOut.toFixed(6)})`);
      } else {
        console.log(`[Groq][resp] usage: prompt=${prompt}, completion=${completion}`);
      }
    }
  } catch {}

  if (!content) {
    throw new Error('Groq API returned an empty or invalid response');
  }

  return String(content);
}
