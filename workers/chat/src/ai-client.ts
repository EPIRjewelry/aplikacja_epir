/**
 * worker/src/ai-client.ts
 * Ujednolicony klient do komunikacji z Workers AI.
 * Nazwy typów/historycznych funkcji pozostają dla kompatybilności z istniejącym kodem.
 */

import { CHAT_MODEL_ID, MODEL_PARAMS } from './config/model-params';

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

export type GroqStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: GroqToolCall }
  | { type: 'usage'; prompt_tokens: number; completion_tokens: number }
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
}

export function shouldUseWorkersAi(env: Env): boolean {
  return !!env.AI?.run;
}

const WORKERS_AI_SESSION_ID_MAX_LENGTH = 64;
const WORKERS_AI_SESSION_ID_SAFE_PATTERN = /^[A-Za-z0-9_-]+$/;

function normalizeWorkersAiSessionId(sessionId?: string): string | undefined {
  const trimmed = sessionId?.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.slice(0, WORKERS_AI_SESSION_ID_MAX_LENGTH);
  if (!WORKERS_AI_SESSION_ID_SAFE_PATTERN.test(normalized)) return undefined;
  return normalized;
}

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

async function runModelStream(
  messages: GroqMessage[],
  env: Env,
  options?: {
    tools?: GroqToolCallDefinition[];
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    sessionId?: string;
  },
): Promise<ReadableStream<Uint8Array>> {
  const ai = requireAi(env);
  const stream = (await ai.run(
    CHAT_MODEL_ID,
    {
      messages: messages.map(mapMessageForWorkersAI),
      stream: true,
      temperature: MODEL_PARAMS.temperature,
      max_tokens: MODEL_PARAMS.max_tokens,
      tools: options?.tools,
      tool_choice: options?.tool_choice,
    },
    workersAiRunOptions(options?.sessionId),
  )) as ReadableStream<Uint8Array>;

  if (!stream || typeof stream.getReader !== 'function') {
    throw new Error('Workers AI did not return a stream');
  }

  return stream;
}

export async function streamGroqResponse(
  messages: GroqMessage[],
  env: Env,
  sessionId?: string,
): Promise<ReadableStream<string>> {
  let buffer = '';
  const stream = await runModelStream(messages, env, { sessionId });

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
        } catch (_) {
          continue;
        }

        const choice = parsed?.choices?.[0];
        if (choice?.finish_reason) {
          controller.enqueue({ type: 'done', finish_reason: choice.finish_reason });
        }

        const deltaText = choice?.delta?.content;
        const msgContent = choice?.message?.content;
        const text =
          typeof deltaText === 'string' ? deltaText : typeof msgContent === 'string' ? msgContent : '';
        if (text) controller.enqueue({ type: 'text', delta: text });

        const toolCalls = choice?.delta?.tool_calls || choice?.message?.tool_calls;
        if (Array.isArray(toolCalls)) {
          for (const call of toolCalls) {
            const id = call.id || `call_${toolBuffers.size + 1}`;
            const name = call.function?.name || toolBuffers.get(id)?.name || '';
            const argDelta =
              typeof call.function?.arguments === 'string' ? call.function.arguments : '';
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
        const text =
          typeof deltaText === 'string' ? deltaText : typeof msgContent === 'string' ? msgContent : '';
        if (text) controller.enqueue({ type: 'text', delta: text });
        const toolCalls = choice?.delta?.tool_calls || choice?.message?.tool_calls;
        if (Array.isArray(toolCalls)) {
          for (const call of toolCalls) {
            const id = call.id || `call_${toolBuffers.size + 1}`;
            const name = call.function?.name || toolBuffers.get(id)?.name || '';
            const argDelta =
              typeof call.function?.arguments === 'string' ? call.function.arguments : '';
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
      } catch (_) {}
    },
  });
}

export async function streamGroqEvents(
  messages: GroqMessage[],
  env: Env,
  tools?: GroqToolCallDefinition[],
  sessionId?: string,
): Promise<ReadableStream<GroqStreamEvent>> {
  const stream = await runModelStream(messages, env, {
    tools,
    tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
    sessionId,
  });

  return stream
    .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
    .pipeThrough(createGroqStreamTransform());
}

export const __test = { createGroqStreamTransform };

export async function getGroqResponse(
  messages: GroqMessage[],
  env: Env,
  options?: { max_tokens?: number; sessionId?: string },
): Promise<string> {
  const ai = requireAi(env);
  const result = (await ai.run(
    CHAT_MODEL_ID,
    {
      messages: messages.map(mapMessageForWorkersAI),
      max_tokens: options?.max_tokens ?? MODEL_PARAMS.max_tokens,
      temperature: MODEL_PARAMS.temperature,
    },
    workersAiRunOptions(options?.sessionId),
  )) as { response?: string };

  const content = result?.response;
  if (!content) {
    throw new Error('Workers AI returned an empty or invalid response');
  }

  return String(content);
}
