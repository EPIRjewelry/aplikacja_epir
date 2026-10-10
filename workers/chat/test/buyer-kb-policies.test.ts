import { describe, expect, it, vi } from 'vitest';

import { KB_POLICY_UNAVAILABLE_REPLY, searchShopPoliciesViaMcp } from '../src/buyer/kb-policies';
import * as mcp from '../src/mcp_server';

describe('buyer kb-policies', () => {
  it('returns mcp_error when tool fails', async () => {
    vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({ error: { message: 'fail' } });
    const r = await searchShopPoliciesViaMcp({} as import('../src/config/bindings').Env, 'zwroty');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('mcp_error');
  });

  it('exposes KB unavailable copy for callers', () => {
    expect(KB_POLICY_UNAVAILABLE_REPLY.toLowerCase()).toContain('nie mam dostępu');
  });
});
