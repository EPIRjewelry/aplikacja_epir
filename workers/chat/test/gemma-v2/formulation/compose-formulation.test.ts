/**
 * E5 formulation compose — mutacje:
 * M-E5-1, M-E5-2, M-E5-3, M-E5-4, M-E5-10, M-E5-11, M-E5-12, M-E5-13, M-E5-19
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {composeGemmaReply} from '../../../src/gemma/compose-gemma-reply';
import {buildEpirActionReply} from '../../../src/gemma/actions/reply';
import {makeTrackedSessionNamespace} from '../helpers/session-do-calls';
import {stubGemmaGroqCalls} from '../helpers/stub-gemma-groq';
import * as catalogSearch from '../../../src/gemma/facts/catalog-search';
import * as execute from '../../../src/buyer/execute-buyer-tool';
import * as toolReadiness from '../../../src/buyer/tool-readiness';
import {
  fictionalMatchFromProduct,
  fictionalMultiVariantProduct,
} from '../fixtures/fictional-catalog-products';
import {FICTIONAL_CATALOG_READY_SLOTS, fictionalGemmaIntent} from '../fixtures/gemma-intent';
import {GEMMA_FORMULATION_BUDGET_MS} from '../../../src/gemma/formulation/constants';
import {handleBuyerTurn} from '../../../src/buyer/handle-buyer-turn';
import {geBuyerBody} from '../fixtures/boundary-payloads';
import {makeGemmaRuntimeKv} from '../fixtures/fake-testers-kv';
import {geBuyerBrandLock} from '../helpers/brand-lock-fixtures';
import {gemmaV2EmergencyReply} from '../../../src/gemma/fallback';
import {BuyerTurnOverloadError, BUYER_LLM_OVERLOAD_MESSAGE} from '../../../src/buyer/buyer-llm-retry';
import * as aiClient from '../../../src/ai-client';

describe('E5 compose formulation', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.useRealTimers());

  async function catalogPropozycjeStub() {
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([
      fictionalMatchFromProduct(fictionalMultiVariantProduct()),
    ]);
  }

  it('T-E5-NOB-1: cart turn calls getGroqResponse only once (intent)', async () => {
    const aiSpy = await stubGemmaGroqCalls({
      intent: {state: 'koszyk', cart_action: 'show', cart_consent: true},
    });
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([]);
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'pokaż koszyk',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_nob_1'},
    );
    expect(aiSpy).toHaveBeenCalledTimes(1);
    expect(aiSpy.mock.calls[0][2]?.timingLabel).toBe('buyer_gemma_intent');
  });

  it('T-E5-NOB-1b: potrzeby turn calls getGroqResponse only once', async () => {
    const aiSpy = await stubGemmaGroqCalls({intent: {state: 'potrzeby', slots: {recipient: 'żona'}}});
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_nob_2'},
    );
    expect(aiSpy).toHaveBeenCalledTimes(1);
  });

  it('T-E5-B-1: propozycje with catalog calls intent then formulation', async () => {
    await catalogPropozycjeStub();
    const aiSpy = await stubGemmaGroqCalls({
      intent: {state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}},
      formulation: {text: 'Polecam propozycje poniżej {{g1}}.', product_refs: ['g1']},
    });
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent dla żony',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_b_1'},
    );
    expect(aiSpy).toHaveBeenCalledTimes(2);
    expect(aiSpy.mock.calls[0][2]?.timingLabel).toBe('buyer_gemma_intent');
    expect(aiSpy.mock.calls[1][2]?.timingLabel).toBe('buyer_gemma_formulation');
  });

  it('T-E5-B-2: formulation user payload omits form_of_address', async () => {
    await catalogPropozycjeStub();
    let formulationUser = '';
    await stubGemmaGroqCalls({
      intent: {state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}},
      onFormulation: (messages) => {
        const user = (messages as {role: string; content: string}[]).find((m) => m.role === 'user');
        formulationUser = user?.content ?? '';
      },
    });
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_b_2'},
    );
    expect(formulationUser).not.toContain('form_of_address');
  });

  it('T-E5-FLOW-1: invalid B url → deterministic reply without foreign hosts', async () => {
    await catalogPropozycjeStub();
    await stubGemmaGroqCalls({
      intent: {state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}},
      formulation: {text: 'Zobacz https://evil.example/fikcyjny', product_refs: []},
    });
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_flow_1'},
    );
    expect(reply).not.toMatch(/evil\.example/);
    expect(reply).toContain('propozycje');
  });

  it('T-E5-FLOW-2: validator retry uses second B response', async () => {
    await catalogPropozycjeStub();
    const ai = await import('../../../src/ai-client');
    let bCalls = 0;
    vi.spyOn(ai, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') {
        return JSON.stringify(fictionalGemmaIntent({state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}}));
      }
      bCalls += 1;
      if (bCalls === 1) {
        return JSON.stringify({text: 'https://evil.example/x', product_refs: []});
      }
      return JSON.stringify({
        text: 'Proszę Pana/Panią — propozycje w załączeniu.',
        product_refs: ['g1'],
      });
    });
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_flow_2'},
    );
    expect(bCalls).toBe(2);
    expect(reply).not.toMatch(/Pana\/Panią/);
    expect(reply).not.toMatch(/evil\.example/);
    expect(reply).toMatch(/\/products\//);
  });

  it('T-D5-BIS-E2E-1: B „Polecam Panu lub Pani {{g1}}” dociera jako formulation, nie szablon', async () => {
    await catalogPropozycjeStub();
    vi.spyOn(aiClient, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') {
        return JSON.stringify(fictionalGemmaIntent({state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}}));
      }
      return JSON.stringify({text: 'Polecam Panu lub Pani {{g1}}.', product_refs: ['g1']});
    });
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_d5_bis_ok'},
    );
    expect(reply).toContain('Polecam Panu lub Pani');
    expect(reply).not.toMatch(/\bg\d+:/);
  });

  it('T-D5-BIS-E2E-2: B „Polecam Panu {{g1}}” → szablon deterministyczny', async () => {
    await catalogPropozycjeStub();
    const intent = fictionalGemmaIntent({state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}});
    const runMod = await import('../../../src/gemma/actions/run');
    const runSpy = vi.spyOn(runMod, 'runGemmaAllowedActions');
    vi.spyOn(aiClient, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') {
        return JSON.stringify(intent);
      }
      return JSON.stringify({text: 'Polecam Panu {{g1}}.', product_refs: ['g1']});
    });
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_d5_bis_tpl'},
    );
    const outcome = await runSpy.mock.results[0]?.value;
    const expected = buildEpirActionReply({
      channelId: 'epir-online-store',
      state: 'propozycje',
      intent,
      outcome,
    });
    expect(reply).toBe(expected);
    expect(reply).not.toContain('Polecam Panu');
  });

  it('T-E5-BUYER-LEAK-3: B „g1: {{g1}}” → stitch leak → fallback bez gN: (M12)', async () => {
    const product = fictionalMultiVariantProduct();
    product.title = 'Pierścionek 1 fikcyjny';
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([fictionalMatchFromProduct(product)]);
    const intent = fictionalGemmaIntent({state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}});
    const runMod = await import('../../../src/gemma/actions/run');
    const runSpy = vi.spyOn(runMod, 'runGemmaAllowedActions');
    const ai = await import('../../../src/ai-client');
    vi.spyOn(ai, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') {
        return JSON.stringify(intent);
      }
      return JSON.stringify({text: 'g1: {{g1}}', product_refs: ['g1']});
    });
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_leak_int'},
    );
    const outcome = await runSpy.mock.results[0]?.value;
    const expected = buildEpirActionReply({
      channelId: 'epir-online-store',
      state: 'propozycje',
      intent,
      outcome,
    });
    expect(reply).toBe(expected);
    expect(reply).not.toMatch(/\bg\d+:/);
    expect(reply).toMatch(/\/products\//);
  });

  it('T-E5-FLOW-3: two invalid B responses → buildEpirActionReply', async () => {
    await catalogPropozycjeStub();
    const intent = fictionalGemmaIntent({state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}});
    const runMod = await import('../../../src/gemma/actions/run');
    const runSpy = vi.spyOn(runMod, 'runGemmaAllowedActions');
    const ai = await import('../../../src/ai-client');
    let bCalls = 0;
    vi.spyOn(ai, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') {
        return JSON.stringify(intent);
      }
      bCalls += 1;
      return JSON.stringify({text: 'https://evil.example/x', product_refs: []});
    });
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_flow_3'},
    );
    expect(bCalls).toBe(2);
    const outcome = await runSpy.mock.results[0]?.value;
    const expected = buildEpirActionReply({
      channelId: 'epir-online-store',
      state: 'propozycje',
      intent,
      outcome,
    });
    expect(reply).toBe(expected);
  });

  it('T-E5-SPEED-1: formulation budget timeout → deterministic without hanging B', async () => {
    vi.useFakeTimers();
    await catalogPropozycjeStub();
    const ai = await import('../../../src/ai-client');
    vi.spyOn(ai, 'getGroqResponse').mockImplementation((_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') {
        return Promise.resolve(
          JSON.stringify(fictionalGemmaIntent({state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}})),
        );
      }
      return new Promise(() => {});
    });
    const {namespace} = makeTrackedSessionNamespace();
    const p = composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_speed_1'},
    );
    await vi.advanceTimersByTimeAsync(GEMMA_FORMULATION_BUDGET_MS + 50);
    const reply = await p;
    expect(reply).toContain('propozycje');
  });

  it('T-E5-SPEED-2: B transport error → deterministic, not overload', async () => {
    await catalogPropozycjeStub();
    const ai = await import('../../../src/ai-client');
    vi.spyOn(ai, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') {
        return JSON.stringify(fictionalGemmaIntent({state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}}));
      }
      throw new Error('429 rate limit');
    });
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_speed_2'},
    );
    expect(reply).toContain('propozycje');
  });

  it('T-E5-FORM-1: formulation uses buyer_gemma_formulation timing label', async () => {
    await catalogPropozycjeStub();
    const spy = await stubGemmaGroqCalls({intent: {state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}}});
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_form_1'},
    );
    expect(spy.mock.calls.some((c) => c[2]?.timingLabel === 'buyer_gemma_formulation')).toBe(true);
  });

  it('T-E5-HTTP-1: intent transport → 200 emergency via composeGemmaReply', async () => {
    vi.spyOn(aiClient, 'getGroqResponse').mockRejectedValue(new Error('network down'));
    const kv = makeGemmaRuntimeKv({coreMode: 'v2', channelMode: 'on'});
    const res = await handleBuyerTurn(
      new Request('https://example.com/chat', {method: 'POST'}),
      {GEMMA_RUNTIME_KV: kv} as never,
      geBuyerBrandLock(),
      geBuyerBody({user_message: 'fikcyjne'}),
      {appProxyVerified: true},
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {type: string; reply: string};
    expect(body.type).toBe('message');
    expect(body.reply).toBe(gemmaV2EmergencyReply('epir-online-store'));
  });

  it('T-E5-HTTP-2: overload still returns overload message', async () => {
    vi.spyOn(aiClient, 'getGroqResponse').mockRejectedValue(new BuyerTurnOverloadError());
    const kv = makeGemmaRuntimeKv({coreMode: 'v2', channelMode: 'on'});
    const res = await handleBuyerTurn(
      new Request('https://example.com/chat', {method: 'POST'}),
      {GEMMA_RUNTIME_KV: kv} as never,
      geBuyerBrandLock(),
      geBuyerBody({user_message: 'fikcyjne'}),
      {appProxyVerified: true},
    );
    const body = (await res.json()) as {reply: string};
    expect(body.reply).toBe(BUYER_LLM_OVERLOAD_MESSAGE);
  });

  it('T-E5-INTENT-TRANSPORT-1: GemmaTurnError mapped before handleBuyerTurn 500', async () => {
    const {namespace, calls} = makeTrackedSessionNamespace();
    vi.spyOn(aiClient, 'getGroqResponse').mockRejectedValue(new Error('aig fail'));
    const kv = makeGemmaRuntimeKv({coreMode: 'v2', channelMode: 'on'});
    const res = await handleBuyerTurn(
      new Request('https://example.com/chat', {method: 'POST'}),
      {GEMMA_RUNTIME_KV: kv, SESSION_DO: namespace} as never,
      geBuyerBrandLock(),
      geBuyerBody({user_message: 'fikcyjne', session_id: 'sess_e5_intent_transport'}),
      {appProxyVerified: true},
    );
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.path.includes('end-buyer-turn'))).toBe(true);
  });

  it('T-E5-FLOW-4: B z placeholderami jest przyjęte; kod wstawia URL i cenę z faktów', async () => {
    await catalogPropozycjeStub();
    await stubGemmaGroqCalls({
      intent: {state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}},
      formulation: {
        text: 'Dla Pana lub Pani: polecam serdecznie {{g1}} ({{g1.price}}).',
        product_refs: ['g1'],
      },
    });
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_flow_4'},
    );
    expect(reply).toContain('polecam serdecznie');
    expect(reply).toContain(fictionalMultiVariantProduct().url);
    expect(reply).not.toContain('{{');
  });

  it('T-E5-FLOW-5: „?” w URL faktu nie liczy się jako pytanie (E5-D7 d)', async () => {
    const product = {...fictionalMultiVariantProduct(), url: 'https://example.test/products/fikcyjny?variant=1'};
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([fictionalMatchFromProduct(product)]);
    await stubGemmaGroqCalls({
      intent: {state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}},
      formulation: {text: 'Dla Pana lub Pani: czy ten model {{g1}} odpowiada?', product_refs: ['g1']},
    });
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_flow_5'},
    );
    expect(reply).toContain('czy ten model');
  });

  it('T-E5-SPEED-3: błąd transportu B → bez ponowienia B (A + 1×B)', async () => {
    await catalogPropozycjeStub();
    const ai = await import('../../../src/ai-client');
    const spy = vi.spyOn(ai, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') {
        return JSON.stringify(fictionalGemmaIntent({state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}}));
      }
      throw new Error('network down');
    });
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_speed_3'},
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('T-E5-FACTS-B-1: payload B zawiera nazwę produktu z karty', async () => {
    await catalogPropozycjeStub();
    let formulationUser = '';
    await stubGemmaGroqCalls({
      intent: {state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}},
      onFormulation: (messages) => {
        const user = (messages as {role: string; content: string}[]).find((m) => m.role === 'user');
        formulationUser = user?.content ?? '';
      },
    });
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_facts_b_1'},
    );
    expect(formulationUser).toContain(fictionalMultiVariantProduct().title);
  });

  it('T-E5-SPEED-4: 429 z B → bez ponowienia w rundzie 0 (B nie jest w withLlmRound0Retry)', async () => {
    vi.useFakeTimers();
    await catalogPropozycjeStub();
    let bCalls = 0;
    vi.spyOn(aiClient, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') {
        return JSON.stringify(fictionalGemmaIntent({state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}}));
      }
      bCalls += 1;
      throw new aiClient.AiGatewayHttpError(429, null, 'response');
    });
    const {namespace} = makeTrackedSessionNamespace();
    const p = composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_speed_4'},
    );
    await vi.advanceTimersByTimeAsync(GEMMA_FORMULATION_BUDGET_MS + 50);
    const reply = await p;
    expect(bCalls).toBe(1);
    expect(reply).not.toBe(BUYER_LLM_OVERLOAD_MESSAGE);
  });

  it('T-E5-FLOW-6: naruszenie bez URL (forma „ty”) → odpowiedź deterministyczna, nie tekst B', async () => {
    await catalogPropozycjeStub();
    await stubGemmaGroqCalls({
      intent: {state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}},
      formulation: {text: 'Polecam cię serdecznie: {{g1}}.', product_refs: ['g1']},
    });
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_flow_6'},
    );
    expect(reply).not.toContain('cię');
    expect(reply).toContain('propozycje');
  });

  it('T-E5-HTTP-3: błąd transportu A logowany jako kind intent_transport', async () => {
    vi.spyOn(aiClient, 'getGroqResponse').mockRejectedValue(new Error('network down'));
    const logSpy = vi.spyOn(console, 'log');
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'fikcyjne',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_http_3'},
    );
    expect(reply).toBe(gemmaV2EmergencyReply('epir-online-store'));
    const logged = logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('gemma.turn_error'));
    expect(logged.some((l) => l.includes('"kind":"intent_transport"'))).toBe(true);
  });
});
