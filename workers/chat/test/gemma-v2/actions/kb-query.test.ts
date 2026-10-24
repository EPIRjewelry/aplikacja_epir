import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as kbPolicies from '../../../src/buyer/kb-policies';
import {
  buildKbQueryAttempts,
  pickPrimaryKbQuery,
  searchKbWithQueryAttempts,
} from '../../../src/gemma/actions/kb-query';

describe('kb-query helpers', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('pickPrimaryKbQuery prefers policy_query even when userText is longer', () => {
    // Wcześniej wygrywał dłuższy userText. policy_query jest teraz pełnym pytaniem
    // z parsera intencji i idzie do MCP jako pierwsze, także gdy jest krótsze.
    expect(
      pickPrimaryKbQuery('telefon', 'Jaki jest numer telefonu do pracowni EPIR?'),
    ).toBe('telefon');
    expect(
      pickPrimaryKbQuery('Jaki jest numer telefonu do pracowni?', 'telefon?'),
    ).toBe('Jaki jest numer telefonu do pracowni?');
  });

  it('buildKbQueryAttempts caps at policy_query then distinct userText', () => {
    expect(
      buildKbQueryAttempts('Jaki jest numer telefonu do pracowni?', 'telefon?'),
    ).toEqual(['Jaki jest numer telefonu do pracowni?', 'telefon?']);
    expect(buildKbQueryAttempts('telefon?', 'telefon?')).toEqual(['telefon?']);
  });

  it('searchKbWithQueryAttempts retries userText after empty policy_query', async () => {
    const spy = vi
      .spyOn(kbPolicies, 'searchShopPoliciesViaMcp')
      .mockResolvedValueOnce({ok: false, reason: 'empty'})
      .mockResolvedValueOnce({
        ok: true,
        answer: 'Fikcyjna odpowiedź KB.',
        sources: [],
        contentHash: 'h1',
      });
    const out = await searchKbWithQueryAttempts(
      {} as never,
      'Jaki jest numer telefonu do pracowni?',
      'telefon?',
    );
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]?.[1]).toBe('Jaki jest numer telefonu do pracowni?');
    expect(spy.mock.calls[1]?.[1]).toBe('telefon?');
    expect(out.result.ok).toBe(true);
    expect(out.kb_retry).toBe(true);
    expect(out.trace.map((row) => row.attempt)).toEqual([1, 2]);
  });

  it('searchKbWithQueryAttempts stops on mcp_error', async () => {
    const spy = vi.spyOn(kbPolicies, 'searchShopPoliciesViaMcp').mockResolvedValue({
      ok: false,
      reason: 'mcp_error',
      subreason: 'transport',
    });
    const out = await searchKbWithQueryAttempts({} as never, 'a', 'b');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(out.result.reason).toBe('mcp_error');
  });
});
