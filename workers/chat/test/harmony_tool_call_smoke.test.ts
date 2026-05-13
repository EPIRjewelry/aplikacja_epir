/// <reference types="@cloudflare/workers-types" />
/**
 * Smoke test (offline) dla migracji na Harmony / GPT-OSS-120B.
 *
 * Scenariusz biznesowy: klient pyta o produkt → model wywołuje `search_catalog`
 * → backend dokleja wynik MCP → model w drugiej turze emituje finalny tekst.
 *
 * Pokrywamy trzy stany pętli orchestracji w `streamAssistantResponse`:
 *   1. Happy path — kanał `analysis` (reasoning) NIE wycieka do widoku klienta,
 *      kanał `commentary` (tool_calls) jest hermetyzowany, kanał `final` jest
 *      jedyną treścią widoczną w `delta`. Payload pierwszego POST-a do Gatewaya
 *      ma `parallel_tool_calls`, `include_reasoning`, `reasoning_effort` i NIE
 *      ma `response_format` (regresja na incydent Groq sierpień 2025 — `400`
 *      przy `json_schema` + `tools`).
 *   2. Parallel tools — model emituje dwa `tool_calls` w jednej turze; oba
 *      muszą zostać zagregowane przez slot-based merge w `createGroqStreamTransform`
 *      i wykonane przed turem finalnym.
 *   3. Gateway 400 — Groq odrzuca request; lifecycle task musi wyemitować
 *      `event: error` zamiast pokazać klientowi treść błędu.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/config/bindings';
import { streamAssistantResponse } from '../src/index';
import * as mcpServer from '../src/mcp_server';
import * as aiClient from '../src/ai-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

const sseFrame = (obj: unknown): Uint8Array =>
  enc.encode(`data: ${JSON.stringify(obj)}\n\n`);

const sseDone = (): Uint8Array => enc.encode('data: [DONE]\n\n');

function makeReadable(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

/** Strumień Harmony turn 0 — reasoning + tool_call + `finish_reason=tool_calls`. */
function harmonyToolCallStream(args: {
  toolName: string;
  toolCallId: string;
  toolArgs: Record<string, unknown>;
  reasoningPreview?: string;
}): ReadableStream<Uint8Array> {
  const reasoning = args.reasoningPreview ?? 'Sprawdzę katalog dla klienta przed odpowiedzią.';
  return makeReadable([
    // delta.reasoning (kanał `analysis` Harmony) — NIE powinien trafić do klienta.
    sseFrame({
      choices: [{ index: 0, delta: { reasoning } }],
    }),
    // delta.tool_calls (kanał `commentary` Harmony) — chunkowane argumenty.
    sseFrame({
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: args.toolCallId,
                type: 'function',
                function: { name: args.toolName, arguments: '' },
              },
            ],
          },
        },
      ],
    }),
    sseFrame({
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { arguments: JSON.stringify(args.toolArgs) },
              },
            ],
          },
        },
      ],
    }),
    // Finalizacja tury narzędzi.
    sseFrame({
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      usage: {
        prompt_tokens: 1500,
        completion_tokens: 80,
        completion_tokens_details: { reasoning_tokens: 60 },
      },
    }),
    sseDone(),
  ]);
}

/** Strumień Harmony turn 0 z DWOMA równoległymi tool_calls (Parallel Function Calling). */
function harmonyParallelToolCallStream(args: {
  callA: { id: string; name: string; args: Record<string, unknown> };
  callB: { id: string; name: string; args: Record<string, unknown> };
}): ReadableStream<Uint8Array> {
  return makeReadable([
    sseFrame({
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: args.callA.id,
                type: 'function',
                function: { name: args.callA.name, arguments: '' },
              },
              {
                index: 1,
                id: args.callB.id,
                type: 'function',
                function: { name: args.callB.name, arguments: '' },
              },
            ],
          },
        },
      ],
    }),
    sseFrame({
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              { index: 0, function: { arguments: JSON.stringify(args.callA.args) } },
              { index: 1, function: { arguments: JSON.stringify(args.callB.args) } },
            ],
          },
        },
      ],
    }),
    sseFrame({
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      usage: {
        prompt_tokens: 1700,
        completion_tokens: 100,
        completion_tokens_details: { reasoning_tokens: 55 },
      },
    }),
    sseDone(),
  ]);
}

/** Strumień Harmony turn N — finalny tekst dla klienta + usage z reasoning_tokens. */
function harmonyFinalTextStream(text: string): ReadableStream<Uint8Array> {
  return makeReadable([
    sseFrame({
      choices: [{ index: 0, delta: { content: text } }],
    }),
    sseFrame({
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: 2100,
        completion_tokens: 220,
        completion_tokens_details: { reasoning_tokens: 90 },
      },
    }),
    sseDone(),
  ]);
}

/** Pusta historia + brak cart + brak klienta — stub DO wystarczający do pełnego przebiegu. */
function makeSessionStub() {
  return {
    fetch: vi.fn(async (input: RequestInfo) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/history')) return new Response(JSON.stringify([]));
      if (url.includes('/cart-id')) return new Response(JSON.stringify({ cart_id: null }));
      if (url.includes('/customer')) return new Response(JSON.stringify({ customer: null }));
      return new Response('ok', { status: 200 });
    }),
  };
}

const baseEnv = (): Env =>
  ({
    SHOPIFY_APP_SECRET: 'mock-app-secret-harmony',
    MCP_ENDPOINT: 'https://mcp.test.invalid/v1',
    SHOP_DOMAIN: 'epir-test.myshopify.com',
    AI: { run: vi.fn() },
    CF_ACCOUNT_ID: 'test_cf_account',
    AI_GATEWAY_TOKEN: 'test_ai_gateway_token',
    GROQ_API_KEY: 'test_groq_api_key',
    AI_GATEWAY_ID: 'epir-test-gateway',
  }) as unknown as Env;

const baseRequest = () =>
  new Request('https://chat-worker.test/chat?shop=test-shop.myshopify.com', { method: 'POST' });

/**
 * Wywołuje `streamAssistantResponse` z tym samym zestawem opcjonalnych argumentów
 * co `ai_response_parsing.test.ts` — pełna 15-argumentowa sygnatura, brak App Proxy.
 */
async function callStream(args: {
  sessionId: string;
  message: string;
  env: Env;
  stub: ReturnType<typeof makeSessionStub>;
}): Promise<Response> {
  return streamAssistantResponse(
    baseRequest(),
    args.sessionId,
    args.message,
    Date.now(),
    args.stub as unknown as DurableObjectStub,
    args.env,
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
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Case 1: Happy path — reasoning hermetyzowany, tool_call + final text
// ---------------------------------------------------------------------------

describe('Harmony smoke — reasoning + tool_call + finalny tekst', () => {
  it(
    'klient widzi finalny tekst, NIE widzi reasoning ani markup tool_calls; payload trzyma kontrakt Harmony',
    async () => {
      const finalLine = 'Polecam [Obrączkę Aura](https://epir-test.myshopify.com/products/aura). Srebro, 1290 zł.';
      const reasoningPreview = 'Sprawdzę katalog: filtr srebro, limit cenowy 1500 zł, dwie kolekcje.';

      // Mockujemy bezpośrednio MCP zamiast szlaku Shopify (uniknięcie generic fetch + walidacji).
      const mcpSpy = vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
        result: {
          products: [
            {
              id: 'gid://shopify/Product/1',
              title: 'Obrączka Aura',
              price_display_pl: '1 290 zł',
              url: 'https://epir-test.myshopify.com/products/aura',
            },
          ],
        },
      });

      let gatewayCallCount = 0;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('gateway.ai.cloudflare.com')) {
          gatewayCallCount += 1;
          if (gatewayCallCount === 1) {
            return new Response(
              harmonyToolCallStream({
                toolName: 'search_catalog',
                toolCallId: 'call_harm_1',
                toolArgs: { catalog: { query: 'obrączki srebro', filters: { price_max: 1500 } } },
                reasoningPreview,
              }),
              { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
            );
          }
          return new Response(harmonyFinalTextStream(finalLine), {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        }
        // brak innych zewnętrznych wywołań w ścieżce buyer
        return new Response('not-mocked', { status: 599 });
      });

      const env = baseEnv();
      const stub = makeSessionStub();

      const response = await callStream({
        sessionId: 'smoke-harmony-happy',
        message: 'Pokaż obrączki ze srebra do 1500 zł.',
        env,
        stub,
      });

      expect(response.ok).toBe(true);
      const body = await new Response(response.body).text();

      // 1. Klient WIDZI finalny tekst (kanał `final` Harmony).
      expect(body).toContain(finalLine);
      // 2. SSE zawiera oddzielne zdarzenie `tool_call` (kanał `commentary` hermetyzowany).
      expect(body).toContain('event: tool_call');
      expect(body).toContain('search_catalog');
      // 3. Klient NIE WIDZI reasoning (kanał `analysis` odfiltrowany).
      expect(body).not.toContain(reasoningPreview);
      expect(body).not.toContain('Sprawdzę katalog');
      // 4. Klient NIE WIDZI literali tool_calls JSON ani markerów Harmony.
      expect(body).not.toMatch(/\btool_calls\s*:\s*\[/);
      expect(body).not.toMatch(/<\|[^>]+\|>/);

      // 5. MCP zostało wywołane raz, dokładnie dla search_catalog.
      expect(mcpSpy).toHaveBeenCalledTimes(1);
      expect(mcpSpy.mock.calls[0]?.[1]).toBe('search_catalog');

      // 6. Gateway dostał dwa POST-y (turn 0 + turn 1 po wyniku narzędzia).
      const gatewayCalls = fetchSpy.mock.calls.filter((c) =>
        String(typeof c[0] === 'string' ? c[0] : (c[0] as Request).url).includes(
          'gateway.ai.cloudflare.com',
        ),
      );
      expect(gatewayCalls.length).toBe(2);

      // 7. Payload pierwszego POST-a trzyma kontrakt Harmony i NIE używa response_format.
      const firstBody = JSON.parse((gatewayCalls[0]![1] as RequestInit).body as string) as Record<
        string,
        unknown
      >;
      expect(firstBody.model).toBe('openai/gpt-oss-120b');
      expect(firstBody.parallel_tool_calls).toBe(true);
      expect(firstBody.include_reasoning).toBe(true);
      expect(firstBody.reasoning_effort).toBe('low');
      expect(firstBody.max_tokens).toBe(2048);
      // Regresja na incydent Groq sierpień 2025 — `json_schema` + `tools` → 400.
      expect(firstBody.response_format).toBeUndefined();
      expect(Array.isArray(firstBody.tools)).toBe(true);
      expect((firstBody.tools as unknown[]).length).toBeGreaterThan(0);

      // 8. Druga tura też nie ma response_format i też trzyma 2048 budżetu.
      const secondBody = JSON.parse((gatewayCalls[1]![1] as RequestInit).body as string) as Record<
        string,
        unknown
      >;
      expect(secondBody.response_format).toBeUndefined();
      expect(secondBody.include_reasoning).toBe(true);

      // 9. W stub DO trafiły rolę 'assistant' z tool_calls i 'tool' z wynikiem.
      const stubCalls = stub.fetch.mock.calls
        .map(([req]) => req)
        .filter((req) => {
          const url = typeof req === 'string' ? req : (req as Request).url;
          return url.includes('/append');
        });
      expect(stubCalls.length).toBeGreaterThanOrEqual(2);
    },
    15_000,
  );
});

// ---------------------------------------------------------------------------
// Case 2: Parallel tool calls — slot-based merge agreguje dwa narzędzia
// ---------------------------------------------------------------------------

describe('Harmony smoke — parallel tool_calls w jednej turze', () => {
  it('agreguje dwa równoległe wywołania narzędzi przed turem finalnym', async () => {
    const finalLine = 'Zwroty 14 dni i polecam [Obrączka Aura](https://epir-test.myshopify.com/products/aura).';

    const mcpSpy = vi.spyOn(mcpServer, 'callMcpToolDirect').mockImplementation(
      async (_env: any, tool: string) => {
        if (tool === 'search_catalog') {
          return { result: { products: [{ id: '1', title: 'Aura', price_display_pl: '1 290 zł' }] } };
        }
        if (tool === 'search_shop_policies_and_faqs') {
          return {
            result: {
              answers: [{ topic: 'returns', body: 'Zwroty w ciągu 14 dni od otrzymania.' }],
            },
          };
        }
        return { error: { code: -32601, message: 'Method not found' } };
      },
    );

    let gatewayCallCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('gateway.ai.cloudflare.com')) {
        gatewayCallCount += 1;
        if (gatewayCallCount === 1) {
          return new Response(
            harmonyParallelToolCallStream({
              callA: {
                id: 'call_par_a',
                name: 'search_catalog',
                args: { catalog: { query: 'obrączki' } },
              },
              callB: {
                id: 'call_par_b',
                name: 'search_shop_policies_and_faqs',
                args: { query: 'polityka zwrotów' },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
          );
        }
        return new Response(harmonyFinalTextStream(finalLine), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }
      return new Response('not-mocked', { status: 599 });
    });

    const env = baseEnv();
    const stub = makeSessionStub();

    const response = await callStream({
      sessionId: 'smoke-harmony-parallel',
      message: 'Pokaż obrączki i powiedz, jak działają zwroty.',
      env,
      stub,
    });

    expect(response.ok).toBe(true);
    const body = await new Response(response.body).text();

    // Oba narzędzia wykonane w tej samej turze, ZANIM pojawił się finalny tekst.
    expect(mcpSpy).toHaveBeenCalledTimes(2);
    const toolNames = mcpSpy.mock.calls.map((c) => c[1]).sort();
    expect(toolNames).toEqual(['search_catalog', 'search_shop_policies_and_faqs']);

    // Pojedyncze SSE `event: tool_call` z listą obu narzędzi (batched).
    const toolCallEventMatches = body.match(/event: tool_call\ndata: ({[^\n]+})/g) ?? [];
    expect(toolCallEventMatches.length).toBe(1);
    const toolCallPayload = JSON.parse(toolCallEventMatches[0]!.split('\ndata: ')[1]!);
    const toolIds: string[] = (toolCallPayload.tool_call ?? []).map((t: { id: string }) => t.id);
    expect(toolIds.sort()).toEqual(['call_par_a', 'call_par_b']);

    // Gateway wciąż dostał tylko dwa POST-y (jeden turn z parallel + jeden finalny).
    const gatewayCalls = fetchSpy.mock.calls.filter((c) =>
      String(typeof c[0] === 'string' ? c[0] : (c[0] as Request).url).includes(
        'gateway.ai.cloudflare.com',
      ),
    );
    expect(gatewayCalls.length).toBe(2);

    // Finalny tekst dotarł do klienta.
    expect(body).toContain(finalLine);
  }, 15_000);
});

// ---------------------------------------------------------------------------
// Case 3: Gateway 400 — `event: error` zamiast wycieku komunikatu Groq
// ---------------------------------------------------------------------------

describe('Harmony smoke — odporność na HTTP 400 z Groq Gateway', () => {
  it('emituje SSE `event: error` bez ujawniania ciała błędu klientowi', async () => {
    // Wyciszamy console.error, ale rejestrujemy wywołania.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Fallback przez `getGroqResponse` też musi być pod kontrolą, żeby nie trafiał do realnej sieci.
    const getGroqResponseSpy = vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('');

    const incidentBody = JSON.stringify({
      error: {
        message: 'json_schema with tools is not supported on gpt-oss-120b',
        type: 'invalid_request_error',
        code: 'json_schema_with_tools_unsupported',
      },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('gateway.ai.cloudflare.com')) {
        return new Response(incidentBody, {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('not-mocked', { status: 599 });
    });

    const env = baseEnv();
    const stub = makeSessionStub();

    const response = await callStream({
      sessionId: 'smoke-harmony-400',
      message: 'Czy macie srebrne obrączki?',
      env,
      stub,
    });

    expect(response.ok).toBe(true);
    const body = await new Response(response.body).text();

    // Klient dostaje sygnał błędu, ale BEZ wycieku treści `json_schema_with_tools_unsupported`.
    expect(body).toContain('event: error');
    expect(body).not.toContain('json_schema_with_tools_unsupported');
    expect(body).not.toContain('invalid_request_error');

    // Lifecycle catch zalogował błąd przez console.error.
    const errorLogged = errorSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('Error in streamAssistantResponse')),
    );
    expect(errorLogged).toBe(true);

    // Sygnalizujemy też, że Gateway dostał POST i odebraliśmy 400.
    const gatewayHits = fetchSpy.mock.calls.filter((c) =>
      String(typeof c[0] === 'string' ? c[0] : (c[0] as Request).url).includes(
        'gateway.ai.cloudflare.com',
      ),
    );
    expect(gatewayHits.length).toBeGreaterThanOrEqual(1);

    // Fallback `getGroqResponse` NIE jest uruchamiany przy hard-failu pętli (rzut → catch).
    expect(getGroqResponseSpy).not.toHaveBeenCalled();
  }, 15_000);
});
