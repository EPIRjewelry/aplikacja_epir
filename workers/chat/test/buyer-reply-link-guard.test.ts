import {describe, expect, it, vi} from 'vitest';
import {
  collectAllowedUrls,
  foreignHostsInReply,
  guardBuyerReplyLinks,
  REPLY_LINK_REJECTED_CATALOG_MESSAGE,
  REPLY_LINK_REJECTED_NEUTRAL_MESSAGE,
} from '../src/buyer/reply-link-guard';
import * as aiClient from '../src/ai-client';

describe('reply-link-guard', () => {
  it('passes reply when link host is on allowlist', () => {
    const allowed = collectAllowedUrls(['https://epirbizuteria.pl/products/ring-a']);
    const foreign = foreignHostsInReply(
      'Polecam [Pierścionek](https://epirbizuteria.pl/products/ring-a).',
      allowed,
    );
    expect(foreign).toEqual([]);
  });

  it('flags example.com when not on allowlist', () => {
    const allowed = collectAllowedUrls(['https://epirbizuteria.pl/products/ring-a']);
    const foreign = foreignHostsInReply(
      'Zobacz [X](https://example.com/foo).',
      allowed,
    );
    expect(foreign).toContain('example.com');
  });

  it('treats every link as foreign when allowlist is empty', async () => {
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue(
      'Nadal [zły](https://example.com/x).',
    );
    const allowed = new Set<string>();
    const out = await guardBuyerReplyLinks(
      {} as import('../src/config/bindings').Env,
      'Link [zły](https://example.com/y).',
      allowed,
      {
        systemBase: 'sys',
        userText: 'Pokaż pierścionek',
        hadSearchCatalogThisTurn: false,
      },
    );
    expect(out).toBe(REPLY_LINK_REJECTED_NEUTRAL_MESSAGE);
  });

  it('rejects with catalog message when search_catalog ran this turn', async () => {
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue(
      'Nadal [zły](https://example.com/x).',
    );
    const allowed = collectAllowedUrls(['https://epirbizuteria.pl/products/a']);
    const out = await guardBuyerReplyLinks(
      {} as import('../src/config/bindings').Env,
      'Link [zły](https://example.com/y).',
      allowed,
      {
        systemBase: 'sys',
        userText: 'Szukam pierścionka',
        hadSearchCatalogThisTurn: true,
      },
    );
    expect(out).toBe(REPLY_LINK_REJECTED_CATALOG_MESSAGE);
  });

  it('retry includes original user question', async () => {
    const groqSpy = vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('OK bez linków.');
    const allowed = collectAllowedUrls(['https://epirbizuteria.pl/products/a']);
    await guardBuyerReplyLinks(
      {} as import('../src/config/bindings').Env,
      'Zły [link](https://example.com/z).',
      allowed,
      {
        systemBase: 'sys',
        userText: 'Jakie są warunki zwrotu?',
        hadSearchCatalogThisTurn: false,
      },
    );
    const messages = groqSpy.mock.calls[0]?.[0] ?? [];
    expect(messages.some((m) => m.role === 'user' && m.content === 'Jakie są warunki zwrotu?')).toBe(
      true,
    );
    expect(messages.some((m) => m.role === 'assistant')).toBe(true);
  });
});
