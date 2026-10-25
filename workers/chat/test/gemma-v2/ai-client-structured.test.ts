/**
 * E5b ai-client structured outputs — mutacje M-B1..M-B4, M-B13
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  getGroqResponse,
  getGroqResponseViaGateway,
  type GroqJsonSchemaResponseFormat,
  type GroqMessage,
} from '../../src/ai-client';
import {
  BUYER_AIG_RETRY,
  BUYER_MODEL_PARAMS,
  MODEL_PARAMS,
  MODEL_VARIANTS,
} from '../../src/config/model-params';
import type {Env} from '../../src/config/bindings';

afterEach(() => vi.restoreAllMocks());

const messages: GroqMessage[] = [{role: 'user', content: 'fikcyjne'}];

function gatewayEnv(): Env {
  return {
    CF_ACCOUNT_ID: 'test_cf_account',
    AI_GATEWAY_TOKEN: 'test_ai_gateway_token',
    GROQ_API_KEY: 'test_groq_api_key',
    AI_GATEWAY_ID: 'epir-test-gateway',
  } as unknown as Env;
}

function jsonOk(content = '{}') {
  return new Response(
    JSON.stringify({choices: [{message: {content}}], usage: {}}),
    {status: 200, headers: {'Content-Type': 'application/json'}},
  );
}

function parseGatewayCall(call: unknown[]) {
  const init = call[1] as RequestInit;
  return {
    body: JSON.parse(init.body as string) as Record<string, unknown>,
    headers: new Headers(init.headers),
    signal: init.signal,
  };
}

const buyerBodyKeys = [
  'model',
  'messages',
  'stream',
  'max_completion_tokens',
  'temperature',
  'top_p',
  'include_reasoning',
  'reasoning_effort',
];

const nonBuyerBodyKeys = [
  'model',
  'messages',
  'stream',
  'max_tokens',
  'temperature',
  'top_p',
  'include_reasoning',
  'reasoning_effort',
];

const buyerHeaderKeys = [
  'content-type',
  'cf-aig-authorization',
  'authorization',
  'cf-aig-max-attempts',
  'cf-aig-retry-delay',
  'cf-aig-backoff',
];

describe('E5b ai-client gateway structured outputs', () => {
  it('T-AIC-LEGACY-1: buyer body/headers unchanged without responseFormat/timeoutMs', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonOk('{}'));
    await getGroqResponseViaGateway(messages, gatewayEnv(), {timingLabel: 'buyer_x'});
    const {body, headers, signal} = parseGatewayCall(fetchSpy.mock.calls[0]!);
    expect(Object.keys(body).sort()).toEqual(buyerBodyKeys.sort());
    expect(body.reasoning_effort).toBe('medium');
    expect(body.max_completion_tokens).toBe(BUYER_MODEL_PARAMS.max_completion_tokens);
    expect('response_format' in body).toBe(false);
    expect(signal).toBeUndefined();
    const headerNames = [...headers.keys()].map((h) => h.toLowerCase()).sort();
    expect(headerNames).toEqual(buyerHeaderKeys.sort());
    expect(headers.get('cf-aig-max-attempts')).toBe(String(BUYER_AIG_RETRY.maxAttempts));
    expect(headers.get('cf-aig-request-timeout')).toBeNull();
  });

  it('T-AIC-LEGACY-1-EXACT (Cień): body bajt w bajt (kolejność i wartości) + pełne nagłówki', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonOk('{}'));
    const withAssistant = [
      ...messages,
      {role: 'assistant', content: 'fikcyjna odp', reasoning: 'fikcyjny reasoning'} as unknown as GroqMessage,
    ];
    await getGroqResponseViaGateway(withAssistant, gatewayEnv(), {timingLabel: 'buyer_x'});
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      'https://gateway.ai.cloudflare.com/v1/test_cf_account/epir-test-gateway/groq/chat/completions',
    );
    expect(init.body).toBe(
      JSON.stringify({
        model: MODEL_VARIANTS.default.id.replace('groq/', ''),
        messages: [...messages, {role: 'assistant', content: 'fikcyjna odp'}],
        stream: false,
        max_completion_tokens: BUYER_MODEL_PARAMS.max_completion_tokens,
        temperature: BUYER_MODEL_PARAMS.temperature,
        top_p: BUYER_MODEL_PARAMS.top_p,
        include_reasoning: BUYER_MODEL_PARAMS.include_reasoning,
        reasoning_effort: BUYER_MODEL_PARAMS.reasoning_effort,
      }),
    );
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'cf-aig-authorization': 'Bearer test_ai_gateway_token',
      Authorization: 'Bearer test_groq_api_key',
      'cf-aig-max-attempts': String(BUYER_AIG_RETRY.maxAttempts),
      'cf-aig-retry-delay': String(BUYER_AIG_RETRY.retryDelayMs),
      'cf-aig-backoff': BUYER_AIG_RETRY.backoff,
    });
    expect(init.signal).toBeUndefined();
    expect(init.method).toBe('POST');
  });

  it('T-AIC-LEGACY-2-EXACT (Cień): non-buyer body bajt w bajt + pełne nagłówki', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonOk('hej'));
    await getGroqResponseViaGateway(messages, gatewayEnv(), {timingLabel: 'tool_loop_x'});
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe(
      JSON.stringify({
        model: MODEL_VARIANTS.default.id.replace('groq/', ''),
        messages,
        stream: false,
        max_tokens: MODEL_PARAMS.max_tokens,
        temperature: MODEL_PARAMS.temperature,
        top_p: MODEL_PARAMS.top_p,
        include_reasoning: MODEL_PARAMS.include_reasoning,
        reasoning_effort: MODEL_PARAMS.reasoning_effort,
      }),
    );
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'cf-aig-authorization': 'Bearer test_ai_gateway_token',
      Authorization: 'Bearer test_groq_api_key',
    });
    expect(init.signal).toBeUndefined();
  });

  it('T-AIC-LEGACY-2: non-buyer label — MODEL_PARAMS keys, no cf-aig-*', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonOk('hej'));
    await getGroqResponseViaGateway(messages, gatewayEnv(), {
      timingLabel: 'tool_loop_x',
    });
    const {body, headers, signal} = parseGatewayCall(fetchSpy.mock.calls[0]!);
    expect(Object.keys(body).sort()).toEqual(nonBuyerBodyKeys.sort());
    expect(body.max_tokens).toBe(MODEL_PARAMS.max_tokens);
    expect('response_format' in body).toBe(false);
    expect(signal).toBeUndefined();
    expect(headers.get('cf-aig-max-attempts')).toBeNull();
  });

  it('T-AIC-SO-1: responseFormat deep-equal on body; buyer keys otherwise', async () => {
    const fmt: GroqJsonSchemaResponseFormat = {
      type: 'json_schema',
      json_schema: {name: 'fikcyjny_test', strict: true, schema: {type: 'object'}},
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonOk('{}'));
    await getGroqResponseViaGateway(messages, gatewayEnv(), {
      timingLabel: 'buyer_x',
      responseFormat: fmt,
    });
    const {body} = parseGatewayCall(fetchSpy.mock.calls[0]!);
    expect(body.response_format).toEqual(fmt);
    expect(Object.keys(body).sort()).toEqual([...buyerBodyKeys, 'response_format'].sort());
  });

  it('T-AIC-TO-1: timeoutMs sets AbortSignal; fetch aborts within budget', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const sig = init?.signal;
        if (sig) {
          sig.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }
      });
    });
    const p = getGroqResponseViaGateway(messages, gatewayEnv(), {
      timingLabel: 'buyer_x',
      timeoutMs: 20,
    });
    await vi.advanceTimersByTimeAsync(25);
    await expect(p).rejects.toThrow();
    const {signal, headers} = parseGatewayCall(fetchSpy.mock.calls[0]!);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(headers.get('cf-aig-request-timeout')).toBeNull();
    vi.useRealTimers();
  });

  it('T-AIC-ROUTE-1: OpenRouter ignores responseFormat on body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({choices: [{message: {content: 'ok'}}]}), {status: 200}),
    );
    const fmt: GroqJsonSchemaResponseFormat = {
      type: 'json_schema',
      json_schema: {name: 'gemma_intent', strict: true, schema: {type: 'object'}},
    };
    await getGroqResponse(messages, {
      ...gatewayEnv(),
      OPENROUTER_API_KEY: 'test_or_key',
    } as Env, {
      modelId: 'openrouter/openai/gpt-4o-mini',
      responseFormat: fmt,
      timingLabel: 'buyer_x',
    });
    expect(fetchSpy).toHaveBeenCalled();
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect('response_format' in body).toBe(false);
  });
});
