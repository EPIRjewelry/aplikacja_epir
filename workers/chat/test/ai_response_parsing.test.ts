/// <reference types="@cloudflare/workers-types" />
import { describe, expect, it, vi, afterEach } from 'vitest';
import * as aiClient from '../src/ai-client';
import { getGroqResponse, type GroqMessage } from '../src/ai-client';
import type { Env } from '../src/config/bindings';
import { EXTRACTOR_LLM_MAX_TOKENS, MODEL_VARIANTS } from '../src/config/model-params';

/** Domyślny `CHAT_MODEL_ID` to Scout (Gateway); testy parsowania Workers AI wymuszają model @cf/... */
const workersAiTestModelId = MODEL_VARIANTS.gemma4_26b.id;
import { streamAssistantResponse } from '../src/index';

const messages: GroqMessage[] = [{ role: 'user', content: 'Cześć' }];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getGroqResponse polymorphic parsing', () => {
  it('returns direct response field when available', async () => {
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({ response: 'Płaska odpowiedź.' }),
      },
    };

    await expect(getGroqResponse(messages, env, { modelId: workersAiTestModelId })).resolves.toBe('Płaska odpowiedź.');
  });

  it('returns text from Workers AI nested response.message-style content array', async () => {
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({
          response: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Zagnieżdżona ' }, { type: 'text', text: 'odpowiedź.' }],
          },
        }),
      },
    };

    await expect(getGroqResponse(messages, env, { modelId: workersAiTestModelId })).resolves.toBe(
      'Zagnieżdżona odpowiedź.',
    );
  });

  it('returns content from Kimi-style choices.message.content', async () => {
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Odpowiedź z choices.message.content' } }],
          model: '@cf/moonshotai/kimi-k2.5',
        }),
      },
    };

    await expect(getGroqResponse(messages, env, { modelId: workersAiTestModelId })).resolves.toBe(
      'Odpowiedź z choices.message.content',
    );
  });

  it('returns joined text from array content parts', async () => {
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: [
                  { type: 'text', text: 'Pierwsza część. ' },
                  { type: 'text', text: 'Druga część.' },
                ],
              },
            },
          ],
        }),
      },
    };

    await expect(getGroqResponse(messages, env, { modelId: workersAiTestModelId })).resolves.toBe(
      'Pierwsza część. Druga część.',
    );
  });

  it('returns content from legacy choices.text shape', async () => {
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({
          choices: [{ text: 'Odpowiedź z legacy choices.text' }],
          model: '@cf/moonshotai/kimi-k2.5',
        }),
      },
    };

    await expect(getGroqResponse(messages, env, { modelId: workersAiTestModelId })).resolves.toBe(
      'Odpowiedź z legacy choices.text',
    );
  });

  it('throws on invalid response shape', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({ usage: { prompt_tokens: 1 } }),
      },
    };

    await expect(getGroqResponse(messages, env, { modelId: workersAiTestModelId })).rejects.toThrow(
      'Workers AI returned an empty or invalid response',
    );
  });

  it('forMemory: uses reasoning_content when message.content is null', async () => {
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: null,
                reasoning_content: 'Myślę… [{"slot":"intent","value":"browsing","confidence":0.8}]',
              },
              finish_reason: 'length',
            },
          ],
        }),
      },
    };

    await expect(getGroqResponse(messages, env, { forMemory: true, modelId: '@cf/x/y' })).resolves.toBe(
      '[{"slot":"intent","value":"browsing","confidence":0.8}]',
    );
  });

  it('forMemory: empty body returns without throwing; warns, no error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    const env = {
      AI: {
        run: vi
          .fn()
          .mockResolvedValue({ choices: [{ message: { content: null }, finish_reason: 'length' }] }),
      },
    };

    await expect(getGroqResponse(messages, env, { forMemory: true, modelId: '@cf/x/y' })).resolves.toBe(
      '',
    );
    expect(err).not.toHaveBeenCalled();
  });

  it('forMemory: ai.run throws returns empty string', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    const env = {
      AI: { run: vi.fn().mockRejectedValue(new Error('bind')) },
    };

    await expect(
      getGroqResponse(messages, env, { forMemory: true, modelId: '@cf/x/y' }),
    ).resolves.toBe('');
    expect(err).not.toHaveBeenCalled();
  });

  it('returns top-level output_text when present', async () => {
    const env = {
      AI: {
        run: vi.fn().mockResolvedValue({ output_text: '  z output_text.  ' }),
      },
    };

    await expect(getGroqResponse(messages, env, { modelId: workersAiTestModelId })).resolves.toBe('z output_text.');
  });

  it('uses overridden modelId when provided', async () => {
    const run = vi.fn().mockResolvedValue({ response: 'OK' });
    const env = {
      AI: {
        run,
      },
    };

    await expect(
      getGroqResponse(messages, env, { modelId: '@cf/zai-org/glm-4.7-flash' }),
    ).resolves.toBe('OK');

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe('@cf/zai-org/glm-4.7-flash');
  });

  it('passes max_tokens when provided (e.g. extractor budget)', async () => {
    const run = vi.fn().mockResolvedValue({ response: 'x' });
    const env = { AI: { run } };

    await getGroqResponse(messages, env, {
      modelId: '@cf/zai-org/glm-4.7-flash',
      max_tokens: EXTRACTOR_LLM_MAX_TOKENS,
    });

    expect((run.mock.calls[0]?.[1] as { max_tokens?: number })?.max_tokens).toBe(
      EXTRACTOR_LLM_MAX_TOKENS,
    );
    expect((run.mock.calls[0]?.[1] as { top_p?: number })?.top_p).toBe(0.9);
  });
});

/** Strumień SSE jak z Workers AI (`stream: true`) — jedna delta + `finish_reason: stop`. */
function mockWorkersAiSseStream(assistantText: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = JSON.stringify({
    choices: [{ delta: { content: assistantText }, finish_reason: 'stop' }],
  });
  const chunk = `data: ${payload}\n\n`;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('streamAssistantResponse – brak tool_calls nie uruchamia fallbacku', () => {
  it('nie wywołuje getGroqResponse, gdy model zwróci tekst bez tool_calls', async () => {
    const assistantLine = 'Dzień dobry, Krzysztofie!';
    const aiRunMock = vi.fn().mockResolvedValue(mockWorkersAiSseStream(assistantLine));
    const origFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('gateway.ai.cloudflare.com')) {
        return new Response(mockWorkersAiSseStream(assistantLine), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }
      return origFetch(input as RequestInfo, init);
    });

    const env = {
      SHOPIFY_APP_SECRET: 'mock-app-secret-12345',
      MCP_ENDPOINT: 'https://mcp.test.invalid/v1',
      AI: { run: aiRunMock },
      CF_ACCOUNT_ID: 'test_cf_account',
      AI_GATEWAY_TOKEN: 'test_ai_gateway_token',
      GROQ_API_KEY: 'test_groq_api_key_for_vitest',
    } as unknown as Env;

    const stub = {
      fetch: vi.fn(async (input: RequestInfo) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/history')) return new Response(JSON.stringify([]));
        if (url.includes('/cart-id')) return new Response(JSON.stringify({ cart_id: null }));
        if (url.includes('/customer')) return new Response(JSON.stringify({ customer: null }));
        return new Response('ok', { status: 200 });
      }),
    };

    const getGroqResponseSpy = vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue(
      'FALLBACK TEKST (nie powinien zostać użyty)',
    );

    const request = new Request('https://chat-worker.test/chat?shop=test-shop.myshopify.com');

    const response = await streamAssistantResponse(
      request,
      'test-session-no-tools',
      'czesc',
      Date.now(),
      stub as unknown as DurableObjectStub,
      env,
      undefined,
      undefined,
      undefined,
      undefined,
      null,
      undefined,
      null,
      undefined,
      null,
    );

    expect(response.ok).toBe(true);
    const bodyText = await new Response(response.body).text();
    expect(bodyText).toContain(assistantLine);
    expect(fetchSpy).toHaveBeenCalled();
    const gwCall = fetchSpy.mock.calls.find((c) =>
      String(typeof c[0] === 'string' ? c[0] : (c[0] as Request).url).includes('gateway.ai.cloudflare.com'),
    );
    expect(gwCall).toBeDefined();
    const init = gwCall![1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get('cf-aig-authorization')).toBe('Bearer test_ai_gateway_token');
    expect(headers.get('Authorization')).toBe('Bearer test_groq_api_key_for_vitest');
    expect(JSON.parse(init!.body as string).model).toBe(
      MODEL_VARIANTS.scout_17b.id.replace(/^groq\//, ''),
    );
    expect(aiRunMock).not.toHaveBeenCalled();
    expect(getGroqResponseSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
