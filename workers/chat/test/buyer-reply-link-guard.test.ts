import {describe, expect, it, vi} from 'vitest';
import {
  collectAllowedUrls,
  foreignHostsInReply,
  guardBuyerReplyLinks,
  sanitizeMarkdownLinks,
  REPLY_LINK_REJECTED_CATALOG_MESSAGE,
  REPLY_LINK_REJECTED_NEUTRAL_MESSAGE,
} from '../src/buyer/reply-link-guard';
import * as aiClient from '../src/ai-client';

describe('reply-link-guard', () => {
  it('rejects different /cart/c/ token or key than allowlisted URL', () => {
    const allowed = collectAllowedUrls([
      'https://shop.myshopify.com/cart/c/GOOD?key=abc',
    ]);
    expect(
      sanitizeMarkdownLinks(
        '[k](https://shop.myshopify.com/cart/c/BAD?key=abc)',
        allowed,
      ),
    ).toBe('');
    expect(
      foreignHostsInReply(
        '[k](https://shop.myshopify.com/cart/c/BAD?key=abc)',
        allowed,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      sanitizeMarkdownLinks(
        '[k](https://shop.myshopify.com/cart/c/GOOD?key=evil)',
        allowed,
      ),
    ).toBe('');
  });

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

  it('retry ends with user correction (not assistant role for rejected reply)', async () => {
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
    expect(messages.some((m) => m.role === 'assistant')).toBe(false);
    const users = messages.filter((m) => m.role === 'user');
    expect(users.length).toBeGreaterThanOrEqual(1);
    expect(String(users[users.length - 1]?.content ?? '')).toContain(
      'Popraw odpowiedź bez niedozwolonych linków',
    );
    expect(String(users[users.length - 1]?.content ?? '')).toContain(
      'Jakie są warunki zwrotu?',
    );
  });

  it('empty retry content is treated as rejection', async () => {
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('   ');
    const allowed = collectAllowedUrls(['https://epirbizuteria.pl/products/a']);
    const out = await guardBuyerReplyLinks(
      {} as import('../src/config/bindings').Env,
      'Zły [link](https://example.com/z).',
      allowed,
      {
        systemBase: 'sys',
        userText: 'hej',
        hadSearchCatalogThisTurn: false,
      },
    );
    expect(out).toBe(REPLY_LINK_REJECTED_NEUTRAL_MESSAGE);
  });

  const shopDomain = 'epir-art-silver-jewellery.myshopify.com';
  const cartContinue = `https://${shopDomain}/cart/c/TOKEN123?key=k1`;

  it('keeps exact allowlisted SHOP_DOMAIN continue_url on all channels (get_cart this turn)', () => {
    const allowed = collectAllowedUrls([cartContinue]);
    for (const channelId of [
      'epir-online-store',
      'kazka-hydrogen',
      'epir-zareczyny',
    ] as const) {
      const out = sanitizeMarkdownLinks(
        `Koszyk: [Przejdź do koszyka](${cartContinue})`,
        allowed,
        {channelId, shopDomain},
      );
      expect(out).toContain(cartContinue);
      expect(out.match(/\/cart\/c\//g)?.length).toBe(1);
      expect(out).toMatch(/myshopify\.com\/cart\/c\//);
    }
  });

  it('strips myshopify /cart/c/ when only session/history (not on allowlist)', () => {
    const allowed = collectAllowedUrls([]); // preload sesji nie seeduje continue_url
    const stale = `https://${shopDomain}/cart/c/STALE?key=old`;
    const out = sanitizeMarkdownLinks(
      `Stary [koszyk](${stale})`,
      allowed,
      {channelId: 'epir-online-store', shopDomain},
    );
    expect(out).not.toContain('/cart/c/');
    expect(out).not.toContain('myshopify.com');
    expect(out.match(/\/cart\/c\//g)?.length ?? 0).toBe(0);
  });

  it('does not allow SHOP_DOMAIN host for non-allowlisted URL even if same host', () => {
    const allowed = collectAllowedUrls([cartContinue]);
    const other = `https://${shopDomain}/cart/c/OTHER`;
    const out = sanitizeMarkdownLinks(
      `[x](${other})`,
      allowed,
      {channelId: 'kazka-hydrogen', shopDomain},
    );
    expect(out).toBe('');
    expect(out).not.toContain('/cart/c/');
  });
});
