/**
 * PR B: BUYER_MODEL_PARAMS + cf-aig retry tylko dla timingLabel buyer_*.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getGroqResponseViaGateway,
  streamGroqEventsViaGateway,
  type GroqMessage,
} from '../src/ai-client';
import {
  BUYER_AIG_RETRY,
  BUYER_MODEL_PARAMS,
  EXTRACTOR_LLM_MAX_TOKENS,
  MODEL_PARAMS,
  isBuyerTimingLabel,
} from '../src/config/model-params';
import { composeBuyerAssistantReply } from '../src/buyer/compose-buyer-turn';
import * as toolReadiness from '../src/buyer/tool-readiness';
import * as aiProfile from '../src/ai-profile';
import * as aiClient from '../src/ai-client';
import * as sessionHistory from '../src/buyer/session-history';
import * as sessionCart from '../src/buyer/session-cart';
import * as executeBuyerToolMod from '../src/buyer/execute-buyer-tool';
import type { Env } from '../src/config/bindings';

afterEach(() => {
  vi.restoreAllMocks();
});

const enc = new TextEncoder();

function sseTextDone(text: string): ReadableStream<Uint8Array> {
  const frame = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(frame({ choices: [{ index: 0, delta: { content: text } }] }));
      controller.enqueue(
        frame({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
      );
      controller.enqueue(enc.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

function gatewayEnv(): Env {
  return {
    CF_ACCOUNT_ID: 'test_cf_account',
    AI_GATEWAY_TOKEN: 'test_ai_gateway_token',
    GROQ_API_KEY: 'test_groq_api_key',
    AI_GATEWAY_ID: 'epir-test-gateway',
  } as unknown as Env;
}

const messages: GroqMessage[] = [{ role: 'user', content: 'cześć' }];

function parseGatewayCall(call: unknown[]): {
  body: Record<string, unknown>;
  headers: Headers;
} {
  const init = call[1] as RequestInit;
  return {
    body: JSON.parse(init.body as string) as Record<string, unknown>,
    headers: new Headers(init.headers),
  };
}

describe('isBuyerTimingLabel', () => {
  it('matches buyer_ prefix only', () => {
    expect(isBuyerTimingLabel('buyer_tool_loop_0')).toBe(true);
    expect(isBuyerTimingLabel('buyer_turn')).toBe(true);
    expect(isBuyerTimingLabel('tool_loop_0')).toBe(false);
    expect(isBuyerTimingLabel(undefined)).toBe(false);
  });
});

describe('buyer gateway params + cf-aig retry headers', () => {
  it('1) buyer_* → medium / max_completion_tokens 4096 / temp 0.3 / top_p 0.9 + retry headers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(sseTextDone('ok'), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const stream = await streamGroqEventsViaGateway(
      messages,
      gatewayEnv(),
      undefined,
      'sess',
      'buyer_tool_loop_0',
    );
    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(fetchSpy).toHaveBeenCalled();
    const { body, headers } = parseGatewayCall(fetchSpy.mock.calls[0]!);
    expect(body.reasoning_effort).toBe('medium');
    expect(body.max_completion_tokens).toBe(4096);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBe(0.3);
    expect(body.top_p).toBe(0.9);
    expect(body.include_reasoning).toBe(true);
    expect(body.reasoning_format).toBeUndefined();
    expect(headers.get('cf-aig-max-attempts')).toBe(String(BUYER_AIG_RETRY.maxAttempts));
    expect(headers.get('cf-aig-retry-delay')).toBe(String(BUYER_AIG_RETRY.retryDelayMs));
    expect(headers.get('cf-aig-backoff')).toBe(BUYER_AIG_RETRY.backoff);
    expect(BUYER_AIG_RETRY.maxAttempts).toBe(2);
    expect(BUYER_MODEL_PARAMS.max_completion_tokens).toBe(4096);
  });

  it('2) tool_loop_* (operator/default) → MODEL_PARAMS + bez cf-aig retry', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(sseTextDone('ok'), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const stream = await streamGroqEventsViaGateway(
      messages,
      gatewayEnv(),
      undefined,
      'sess',
      'tool_loop_0',
    );
    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    const { body, headers } = parseGatewayCall(fetchSpy.mock.calls[0]!);
    expect(body.reasoning_effort).toBe(MODEL_PARAMS.reasoning_effort);
    expect(body.max_tokens).toBe(MODEL_PARAMS.max_tokens);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.temperature).toBe(MODEL_PARAMS.temperature);
    expect(body.top_p).toBe(MODEL_PARAMS.top_p);
    expect(headers.get('cf-aig-max-attempts')).toBeNull();
    expect(headers.get('cf-aig-retry-delay')).toBeNull();
    expect(headers.get('cf-aig-backoff')).toBeNull();
  });

  it('2b) getGroqResponseViaGateway buyer_turn vs default', async () => {
    const jsonOk = () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'hej' } }], usage: {} }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonOk());

    await getGroqResponseViaGateway(messages, gatewayEnv(), {
      timingLabel: 'buyer_turn',
    });
    const buyer = parseGatewayCall(fetchSpy.mock.calls[0]!);
    expect(buyer.body.reasoning_effort).toBe('medium');
    expect(buyer.body.max_completion_tokens).toBe(4096);
    expect(buyer.headers.get('cf-aig-max-attempts')).toBe('2');

    fetchSpy.mockClear();
    fetchSpy.mockResolvedValue(jsonOk());
    await getGroqResponseViaGateway(messages, gatewayEnv(), {
      timingLabel: 'getGroqResponseViaGateway',
    });
    const def = parseGatewayCall(fetchSpy.mock.calls[0]!);
    expect(def.body.reasoning_effort).toBe('low');
    expect(def.body.max_tokens).toBe(2048);
    expect(def.headers.get('cf-aig-max-attempts')).toBeNull();
  });

  it('3) EXTRACTOR_LLM_MAX_TOKENS unchanged (operator/extractor contract)', () => {
    expect(EXTRACTOR_LLM_MAX_TOKENS).toBe(320);
    expect(MODEL_PARAMS.max_tokens).toBe(2048);
    expect(MODEL_PARAMS.reasoning_effort).toBe('low');
    expect(MODEL_PARAMS.temperature).toBe(0.5);
  });

  it('4) BUYER_AIG_RETRY values are 2 / 1000 / exponential', () => {
    expect(BUYER_AIG_RETRY).toEqual({
      maxAttempts: 2,
      retryDelayMs: 1000,
      backoff: 'exponential',
    });
  });
});

function toolCallStream(
  name: string,
  id: string,
  args = '{}',
): ReadableStream<aiClient.GroqStreamEvent> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({
        type: 'tool_call',
        call: { id, name, arguments: args },
      });
      controller.close();
    },
  });
}

describe('5) create_cart once when next LLM round fails with 503', () => {
  it('executeBuyerTool create_cart dokładnie raz; update_cart zero', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([
      'search_catalog',
      'ucp_cart',
    ]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    vi.spyOn(sessionHistory, 'readBuyerSessionHistory').mockResolvedValue([]);
    vi.spyOn(sessionHistory, 'appendBuyerSessionMessage').mockResolvedValue();
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(null);
    vi.spyOn(sessionCart, 'writeSessionCartId').mockResolvedValue();

    const execSpy = vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockResolvedValue({
      content: JSON.stringify({
        id: 'cart-1',
        continue_url: 'https://shop.example/cart/c/token',
        line_items: [],
        messages: [],
      }),
      cartMutationSucceeded: true,
    });

    let round = 0;
    vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(async () => {
      round += 1;
      if (round === 1) {
        return toolCallStream(
          'create_cart',
          'tc-create',
          JSON.stringify({
            line_items: [{ variant_id: 'gid://shopify/ProductVariant/1', quantity: 1 }],
          }),
        );
      }
      // Symulacja: LLM po mutacji koszyka pada 503 (before headers / gateway).
      throw new Error('AI Gateway streaming error: 503');
    });
    // Fallback LLM po 503 (round>0) — bez ponownego create_cart.
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue(
      'Chwilowa przerwa po stronie asystenta. Koszyk został już utworzony — napisz, jeśli chcesz coś zmienić.',
    );

    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as Env;
    const req = new Request('https://example.com/chat', { method: 'POST' });

    const reply = await composeBuyerAssistantReply(
      env,
      'epir-online-store',
      'dodaj do koszyka',
      req,
      { sessionId: 'sess-503' },
    );
    expect(reply.length).toBeGreaterThan(0);

    const cartMutations = execSpy.mock.calls.filter(
      (c) => c[0]?.name === 'create_cart' || c[0]?.name === 'update_cart',
    );
    expect(cartMutations.filter((c) => c[0]?.name === 'create_cart')).toHaveLength(1);
    expect(cartMutations.filter((c) => c[0]?.name === 'update_cart')).toHaveLength(0);
    // stream: round0 tool + round1 503; bez dodatkowych mutacji przy fallback getGroqResponse
    expect(round).toBe(2);
  });
});

describe('E5b gateway legacy pin (additive)', () => {
  it('T-AIC-LEGACY-1b: getGroqResponse buyer_turn without structured options has no response_format', async () => {
    const jsonOk = () =>
      new Response(
        JSON.stringify({choices: [{message: {content: 'hej'}}], usage: {}}),
        {status: 200, headers: {'Content-Type': 'application/json'}},
      );
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonOk());
    await getGroqResponseViaGateway(messages, gatewayEnv(), {timingLabel: 'buyer_turn'});
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect('response_format' in body).toBe(false);
    expect(init.signal).toBeUndefined();
  });
});

describe('6) MODEL_PARAMS defaults remain for non-buyer smoke contract', () => {
  it('operator defaults low / 2048 / 0.5 (harmony smoke path tool_loop_*)', () => {
    expect(MODEL_PARAMS.reasoning_effort).toBe('low');
    expect(MODEL_PARAMS.max_tokens).toBe(2048);
    expect(MODEL_PARAMS.temperature).toBe(0.5);
    expect(BUYER_MODEL_PARAMS.reasoning_effort).toBe('medium');
    expect(BUYER_MODEL_PARAMS.max_completion_tokens).toBe(4096);
    expect(BUYER_MODEL_PARAMS.temperature).toBe(0.3);
  });
});
