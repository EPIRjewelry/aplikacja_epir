/**
 * Krótkie frazy kontaktu: do MCP idzie przepisane policy_query,
 * a przy pustym wyniku druga próba to tekst klienta (maks. 2).
 * Empty ≠ odmowa dostępu do zasad.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {BuyerChannelId} from '../../../src/buyer/channel-switch';
import {KB_POLICY_EMPTY_REPLY, KB_POLICY_UNAVAILABLE_REPLY} from '../../../src/buyer/kb-policies';
import {buildEpirActionReply} from '../../../src/gemma/actions/reply';
import {runGemmaAllowedActions} from '../../../src/gemma/actions/run';
import {DEFAULT_GEMMA_SESSION_STATE} from '../../../src/gemma/state/types';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';

const KB_MARKER = 'FIKCYJNY_KONTAKT_KB';

const CASES = [
  {userText: 'telefon?', policyQuery: 'Jaki jest numer telefonu do pracowni?'},
  {userText: 'numer?', policyQuery: 'Jaki jest numer telefonu do pracowni?'},
  {userText: 'pogadać na miejscu', policyQuery: 'Czy można porozmawiać na miejscu w pracowni?'},
  {userText: 'można przyjechać?', policyQuery: 'Czy można przyjechać do pracowni?'},
  {userText: 'gdzie jesteście', policyQuery: 'Gdzie znajduje się pracownia?'},
  {userText: 'kontakt', policyQuery: 'Jak mogę skontaktować się z pracownią?'},
] as const;

const HIT = {
  ok: true as const,
  answer: KB_MARKER,
  sources: [] as [],
  contentHash: 'h-kontakt',
};

async function replyFor(channelId: BuyerChannelId, userText: string, policyQuery: string) {
  const intent = fictionalGemmaIntent({policy_query: policyQuery, state: 'polityki_kontakt'});
  const outcome = await runGemmaAllowedActions({
    env: {} as never,
    channelId,
    request: new Request('https://example.com'),
    sessionId: 'sess_kb_kontakt',
    userText,
    userCorpus: userText,
    intent,
    prev: DEFAULT_GEMMA_SESSION_STATE,
    transitioned: {nextState: 'polityki_kontakt', slots: {}, allowedActions: ['kb_policies']},
  });
  return buildEpirActionReply({
    channelId,
    state: 'polityki_kontakt',
    intent,
    outcome,
  });
}

describe('KB kontakt — krótkie frazy', () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each(CASES)('$userText → pełne pytanie albo druga próba', async ({userText, policyQuery}) => {
    const kb = await import('../../../src/buyer/kb-policies');
    const spy = vi.spyOn(kb, 'searchShopPoliciesViaMcp');

    spy.mockResolvedValue(HIT);
    const found = await replyFor('epir-online-store', userText, policyQuery);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toBe(policyQuery);
    expect(found).toContain(KB_MARKER);
    expect(found.toLowerCase()).not.toContain('nie mam dostępu');

    spy.mockReset();
    spy.mockResolvedValue({ok: false, reason: 'empty'});
    const empty = await replyFor('epir-online-store', userText, policyQuery);
    expect(spy.mock.calls.map((call) => call[1])).toEqual([policyQuery, userText]);
    expect(empty).toBe(KB_POLICY_EMPTY_REPLY);
    expect(empty.toLowerCase()).not.toContain('nie mam dostępu');

    spy.mockReset();
    spy.mockResolvedValueOnce({ok: false, reason: 'empty'}).mockResolvedValueOnce(HIT);
    const retried = await replyFor('epir-online-store', userText, policyQuery);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]?.[1]).toBe(policyQuery);
    expect(spy.mock.calls[1]?.[1]).toBe(userText);
    expect(retried).toContain(KB_MARKER);
  });

  it('GZ (epir-zareczyny) — ten sam profil EPIR', async () => {
    const kb = await import('../../../src/buyer/kb-policies');
    const spy = vi.spyOn(kb, 'searchShopPoliciesViaMcp');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const row = CASES[0];

    spy.mockResolvedValue(HIT);
    const found = await replyFor('epir-zareczyny', row.userText, row.policyQuery);
    expect(String(spy.mock.calls[0]?.[1])).toBe(row.policyQuery);
    expect(found).toContain(KB_MARKER);
    expect(found.toLowerCase()).not.toContain('nie mam dostępu');

    spy.mockReset();
    log.mockClear();
    spy.mockResolvedValue({ok: false, reason: 'empty'});
    const empty = await replyFor('epir-zareczyny', row.userText, row.policyQuery);
    expect(empty).toBe(KB_POLICY_EMPTY_REPLY);
    expect(empty.toLowerCase()).not.toContain('nie mam dostępu');
    const kbLogs = log.mock.calls
      .map((call) => {
        try {
          return JSON.parse(String(call[0])) as {tag?: string; kb_attempt?: number; kb_reason?: string};
        } catch {
          return null;
        }
      })
      .filter((entry) => entry?.tag === 'gemma.kb');
    expect(kbLogs.map((entry) => entry?.kb_attempt)).toEqual([1, 2]);
    expect(kbLogs.every((entry) => entry?.kb_reason === 'empty')).toBe(true);

    spy.mockReset();
    spy.mockResolvedValue({ok: false, reason: 'mcp_error', subreason: 'transport'});
    const failed = await replyFor('epir-zareczyny', row.userText, row.policyQuery);
    expect(failed).toBe(KB_POLICY_UNAVAILABLE_REPLY);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
