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

  it('parses MCP content JSON with faqs (no top-level answer)', async () => {
    const faqs = [
      {
        question: 'Gdzie jest pracownia?',
        answer: 'ul. Traugutta 123/5, Kraków.',
        source: { url: 'https://shop/faq/address' },
      },
      {
        question: 'Darmowa dostawa?',
        answer: 'Darmowa dostawa od 500 zł.',
        source: { url: 'https://shop/faq/shipping' },
      },
    ];
    vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      result: {
        content: [{ type: 'text', text: JSON.stringify({ faqs, policies: [] }) }],
      },
    });
    const r = await searchShopPoliciesViaMcp({} as import('../src/config/bindings').Env, 'adres');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answer).toContain('Traugutta 123/5');
      expect(r.answer).toContain('500 zł');
      expect(r.sources.some((s) => s.url === 'https://shop/faq/address')).toBe(true);
    }
  });

  it('parses policies summary/body without top-level answer', async () => {
    vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              policies: [
                {
                  title: 'Wysyłka',
                  summary: 'Wysyłka w 1–2 dni robocze.',
                  source: { url: 'https://shop/policies/shipping' },
                },
              ],
              faqs: [],
            }),
          },
        ],
      },
    });
    const r = await searchShopPoliciesViaMcp({} as import('../src/config/bindings').Env, 'wysyłka');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answer).toContain('Wysyłka:');
      expect(r.answer).toContain('1–2 dni');
      expect(r.sources[0]?.url).toBe('https://shop/policies/shipping');
    }
  });

  it('policies precede faqs in composed answer', async () => {
    vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      result: {
        policies: [
          { title: 'Policy first', summary: 'Binding text.' },
        ],
        faqs: [{ question: 'FAQ?', answer: 'FAQ text.' }],
      },
    });
    const r = await searchShopPoliciesViaMcp({} as import('../src/config/bindings').Env, 'x');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const policyIdx = r.answer.indexOf('Binding text.');
      const faqIdx = r.answer.indexOf('FAQ text.');
      expect(policyIdx).toBeGreaterThanOrEqual(0);
      expect(faqIdx).toBeGreaterThan(policyIdx);
    }
  });

  it('empty faqs and policies ⇒ empty reason', async () => {
    vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      result: {
        content: [{ type: 'text', text: JSON.stringify({ faqs: [], policies: [] }) }],
      },
    });
    const r = await searchShopPoliciesViaMcp({} as import('../src/config/bindings').Env, 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });
});
