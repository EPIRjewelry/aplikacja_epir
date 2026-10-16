/**
 * E4 KB — mutacja **M-E4-7** woła KB w propozycjach → T-E4-KB-3 FAIL
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {runKbAction, kbUnavailableReply} from '../../../src/gemma/actions/kb';
import {KB_POLICY_UNAVAILABLE_REPLY} from '../../../src/buyer/kb-policies';
import {DEFAULT_GEMMA_SESSION_STATE} from '../../../src/gemma/state/types';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';

describe('E4 KB action', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-E4-KB-1: policy_query uses searchShopPoliciesViaMcp', async () => {
    const kb = await import('../../../src/buyer/kb-policies');
    const spy = vi.spyOn(kb, 'searchShopPoliciesViaMcp').mockResolvedValue({
      ok: true,
      answer: 'Fikcyjna odpowiedź wysyłki.',
      sources: [{title: 'Wysyłka', url: 'https://example.test/policies/shipping'}],
      contentHash: 'h1',
    });
    const ctx = {
      env: {} as never,
      channelId: 'epir-online-store' as const,
      request: new Request('https://example.com'),
      sessionId: 'sess_e4_kb_1',
      userText: 'pytanie o wysyłkę',
      userCorpus: 'pytanie o wysyłkę',
      intent: fictionalGemmaIntent({policy_query: 'wysyłka'}),
      prev: DEFAULT_GEMMA_SESSION_STATE,
      transitioned: {
        nextState: 'polityki_kontakt' as const,
        slots: {},
        allowedActions: ['kb_policies' as const],
      },
    };
    const out = await runKbAction(ctx);
    expect(spy).toHaveBeenCalled();
    expect(out?.answer).toContain('Fikcyjna');
  });

  it('T-E4-KB-2: MCP fail equals KB_POLICY_UNAVAILABLE_REPLY constant', () => {
    expect(kbUnavailableReply()).toBe(KB_POLICY_UNAVAILABLE_REPLY);
  });

  it('T-E4-KB-3: propozycje turn never calls KB; KB failure reply equals constant', async () => {
    const kb = await import('../../../src/buyer/kb-policies');
    const kbSpy = vi.spyOn(kb, 'searchShopPoliciesViaMcp').mockResolvedValue({ok: false, reason: 'empty'});
    const catalogSearch = await import('../../../src/gemma/facts/catalog-search');
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([]);
    const {runGemmaAllowedActions} = await import('../../../src/gemma/actions/run');
    const base = {
      env: {} as never,
      channelId: 'epir-online-store' as const,
      request: new Request('https://example.com'),
      sessionId: 'sess_e4_kb_3',
      userText: 'fikcyjne',
      userCorpus: 'fikcyjne',
      prev: DEFAULT_GEMMA_SESSION_STATE,
    };
    await runGemmaAllowedActions({
      ...base,
      intent: fictionalGemmaIntent({slots: {recipient: 'żona'}}),
      transitioned: {nextState: 'propozycje', slots: {recipient: 'żona'}, allowedActions: ['search_catalog']},
    });
    expect(kbSpy).not.toHaveBeenCalled();

    const intent = fictionalGemmaIntent({policy_query: 'wysyłka'});
    const outcome = await runGemmaAllowedActions({
      ...base,
      intent,
      transitioned: {nextState: 'polityki_kontakt', slots: {}, allowedActions: ['kb_policies']},
    });
    const {buildEpirActionReply} = await import('../../../src/gemma/actions/reply');
    expect(buildEpirActionReply({channelId: 'epir-online-store', state: 'polityki_kontakt', intent, outcome})).toBe(
      KB_POLICY_UNAVAILABLE_REPLY,
    );
  });
});
