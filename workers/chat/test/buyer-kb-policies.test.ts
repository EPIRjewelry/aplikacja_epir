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

  it('parses structuredContent.answer and sources', async () => {
    vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      result: {
        structuredContent: {
          answer: 'Wysyłka 1–2 dni.',
          sources: [{ title: 'FAQ', url: 'https://shop/faq' }],
        },
      },
    });
    const r = await searchShopPoliciesViaMcp({} as import('../src/config/bindings').Env, 'wysyłka');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answer).toBe('Wysyłka 1–2 dni.');
      expect(r.sources[0]).toEqual({ title: 'FAQ', url: 'https://shop/faq' });
      expect(r.contentHash).toMatch(/^h/);
    }
  });

  it('accepts legacy string sources', async () => {
    vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      result: {
        content: [{ type: 'text', text: JSON.stringify({ answer: 'OK', sources: ['src-a'] }) }],
      },
    });
    const r = await searchShopPoliciesViaMcp({} as import('../src/config/bindings').Env, 'x');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sources[0].title).toBe('src-a');
    }
  });

  it('empty answer ⇒ empty reason', async () => {
    vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      result: { structuredContent: { answer: '', sources: [] } },
    });
    const r = await searchShopPoliciesViaMcp({} as import('../src/config/bindings').Env, 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });
});
