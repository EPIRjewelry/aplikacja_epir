/**
 * E5b HTTP 400 / timeout — mutacje M-B11, M-B12
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {composeGemmaReply} from '../../src/gemma/compose-gemma-reply';
import {gemmaV2EmergencyReply} from '../../src/gemma/fallback';
import {buildEpirActionReply} from '../../src/gemma/actions/reply';
import {handleBuyerTurn} from '../../src/buyer/handle-buyer-turn';
import {makeTrackedSessionNamespace} from './helpers/session-do-calls';
import {stubGemmaGroqCalls} from './helpers/stub-gemma-groq';
import * as catalogSearch from '../../src/gemma/facts/catalog-search';
import {
  fictionalMatchFromProduct,
  fictionalMultiVariantProduct,
} from './fixtures/fictional-catalog-products';
import {FICTIONAL_CATALOG_READY_SLOTS, fictionalGemmaIntent} from './fixtures/gemma-intent';
import {makeGemmaRuntimeKv} from './fixtures/fake-testers-kv';
import {geBuyerBody} from './fixtures/boundary-payloads';
import {geBuyerBrandLock} from './helpers/brand-lock-fixtures';
import {GEMMA_INTENT_TIMEOUT_MS} from '../../src/gemma/intent/constants';

describe('E5b gemma structured HTTP errors', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.useRealTimers());

  it('T-GEMMA-400-A: gateway 400 on A → emergency 200', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Generated JSON does not match the expected schema', {status: 400}),
    );
    const logSpy = vi.spyOn(console, 'log');
    const kv = makeGemmaRuntimeKv({coreMode: 'v2', channelMode: 'on'});
    const res = await handleBuyerTurn(
      new Request('https://example.com/chat', {method: 'POST'}),
      {GEMMA_RUNTIME_KV: kv, CF_ACCOUNT_ID: 'a', AI_GATEWAY_TOKEN: 't', GROQ_API_KEY: 'g'} as never,
      geBuyerBrandLock(),
      geBuyerBody({user_message: 'fikcyjne'}),
      {appProxyVerified: true},
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {reply: string};
    expect(body.reply).toBe(gemmaV2EmergencyReply('epir-online-store'));
    // Cień: 400 naprawdę przyszło z wywołania A ze schematem, a nie z innego miejsca.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string) as {
      response_format?: {json_schema?: {name?: string; strict?: boolean}};
    };
    expect(sent.response_format?.json_schema?.name).toBe('gemma_intent');
    expect(sent.response_format?.json_schema?.strict).toBe(true);
    const logs = logSpy.mock.calls.map((c) => String(c[0]));
    expect(logs).toContain(JSON.stringify({tag: 'gemma.intent.error', http_status: 400, error_name: 'AiGatewayHttpError'}));
    expect(logs).toContain(JSON.stringify({tag: 'gemma.turn_error', kind: 'intent_transport'}));
  });

  it('T-GEMMA-400-B: gateway 400 on B → deterministic template', async () => {
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([
      fictionalMatchFromProduct(fictionalMultiVariantProduct()),
    ]);
    const intent = fictionalGemmaIntent({state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}});
    const ai = await import('../../src/ai-client');
    vi.spyOn(ai, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') return JSON.stringify(intent);
      throw new ai.AiGatewayHttpError(400, null, 'response');
    });
    const runMod = await import('../../src/gemma/actions/run');
    const runSpy = vi.spyOn(runMod, 'runGemmaAllowedActions');
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5b_400_b'},
    );
    const outcome = await runSpy.mock.results[0]?.value;
    const expected = buildEpirActionReply({
      channelId: 'epir-online-store',
      state: 'propozycje',
      intent,
      outcome,
    });
    expect(reply).toBe(expected);
  });

  it('T-GEMMA-TO-A: A timeout → emergency via compose', async () => {
    vi.useFakeTimers();
    const logSpy = vi.spyOn(console, 'log');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      return new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')));
      });
    });
    const {namespace} = makeTrackedSessionNamespace();
    const p = composeGemmaReply(
      {SESSION_DO: namespace, CF_ACCOUNT_ID: 'a', AI_GATEWAY_TOKEN: 't', GROQ_API_KEY: 'g'} as never,
      'epir-online-store',
      'fikcyjne',
      new Request('https://example.com'),
      {sessionId: 'sess_e5b_to_a'},
    );
    await vi.advanceTimersByTimeAsync(GEMMA_INTENT_TIMEOUT_MS + 50);
    const reply = await p;
    expect(reply).toBe(gemmaV2EmergencyReply('epir-online-store'));
    // Cień: emergency wynika z abortu fetch A, nie z wcześniejszego błędu.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.signal?.aborted).toBe(true);
    const logs = logSpy.mock.calls.map((c) => String(c[0]));
    expect(logs).toContain(JSON.stringify({tag: 'gemma.turn_error', kind: 'intent_transport'}));
    vi.useRealTimers();
  });

  it('T-GEMMA-TO-B: B timeout → deterministic', async () => {
    vi.useFakeTimers();
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([
      fictionalMatchFromProduct(fictionalMultiVariantProduct()),
    ]);
    const intent = fictionalGemmaIntent({state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}});
    const ai = await import('../../src/ai-client');
    vi.spyOn(ai, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') {
        return JSON.stringify(intent);
      }
      return new Promise(() => {});
    });
    const runMod = await import('../../src/gemma/actions/run');
    const runSpy = vi.spyOn(runMod, 'runGemmaAllowedActions');
    const {namespace} = makeTrackedSessionNamespace();
    const p = composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5b_to_b'},
    );
    await vi.advanceTimersByTimeAsync(6000);
    const reply = await p;
    const outcome = await runSpy.mock.results[0]?.value;
    expect(reply).toBe(
      buildEpirActionReply({
        channelId: 'epir-online-store',
        state: 'propozycje',
        intent,
        outcome,
      }),
    );
    vi.useRealTimers();
  });
});
