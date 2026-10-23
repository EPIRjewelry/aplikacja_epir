import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as kbPolicies from '../../../src/buyer/kb-policies';
import {pickPrimaryKbQuery, searchKbWithQueryAttempts} from '../../../src/gemma/actions/kb-query';

describe('kb-query helpers', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('pickPrimaryKbQuery prefers longer userText over short policy_query', () => {
    expect(
      pickPrimaryKbQuery('telefon', 'Jaki jest numer telefonu do pracowni EPIR?'),
    ).toBe('Jaki jest numer telefonu do pracowni EPIR?');
  });

  it('searchKbWithQueryAttempts retries alternate query on empty', async () => {
    const spy = vi
      .spyOn(kbPolicies, 'searchShopPoliciesViaMcp')
      .mockResolvedValueOnce({ok: false, reason: 'empty'})
      .mockResolvedValueOnce({
        ok: true,
        answer: 'Fikcyjna odpowiedź KB.',
        sources: [],
        contentHash: 'h1',
      });
    const out = await searchKbWithQueryAttempts({} as never, 'telefon', 'Jaki jest telefon?');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(out.result.ok).toBe(true);
    expect(out.kb_retry).toBe(true);
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
