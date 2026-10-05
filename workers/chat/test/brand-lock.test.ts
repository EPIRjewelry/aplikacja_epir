import {describe, expect, it} from 'vitest';
import {
  greetingForBrandLock,
  guardBuyerReply,
  projectHistoryForBrand,
  resolveChatBrandLock,
} from '../src/brand-lock';

describe('resolveChatBrandLock', () => {
  it('keeps the Liquid app proxy on EPIR even when the body claims Kazka', () => {
    const lock = resolveChatBrandLock({
      appProxyVerified: true,
      contextOverride: {storefrontId: 'online-store', channel: 'online-store', brand: 'epir'},
      bodyBrand: 'kazka',
      bodyStorefrontId: 'kazka',
      bodyChannel: 'hydrogen-kazka',
      pageHost: 'kazka.epirbizuteria.pl',
      referer: 'https://kazka.epirbizuteria.pl/',
    });
    expect(lock.side).toBe('epir');
    expect(lock.brandKey).toBe('epir');
    expect(greetingForBrandLock(lock)).not.toContain('Kazka Jewelry');
    expect(greetingForBrandLock(lock)).toContain('EPIR Art Jewellery');
  });

  it('locks an EPIR host when the client omits brand', () => {
    const lock = resolveChatBrandLock({
      pageHost: 'epirbizuteria.pl',
      referer: 'https://epirbizuteria.pl/collections/zlota-bizuteria',
    });
    expect(lock.side).toBe('epir');
    expect(lock.source).toBe('host');
    expect(greetingForBrandLock(lock)).not.toContain('Kazka');
  });

  it('does not default a missing brand to Kazka', () => {
    const lock = resolveChatBrandLock({});
    expect(lock.side).toBe('epir');
    expect(lock.source).toBe('default');
    expect(greetingForBrandLock(lock)).not.toContain('Kazka Jewelry');
  });

  it('lets an EPIR page host beat a Kazka S2S label', () => {
    const lock = resolveChatBrandLock({
      contextOverride: {storefrontId: 'kazka', channel: 'hydrogen-kazka'},
      bodyBrand: 'kazka',
      pageHost: 'www.epirbizuteria.pl',
    });
    expect(lock.side).toBe('epir');
    expect(lock.brandKey).toBe('epir');
  });

  it('keeps Kazka when the page host is the Kazka storefront', () => {
    const lock = resolveChatBrandLock({
      contextOverride: {storefrontId: 'kazka', channel: 'hydrogen-kazka'},
      bodyBrand: 'epir',
      pageHost: 'kazka.epirbizuteria.pl',
    });
    expect(lock.side).toBe('kazka');
    expect(lock.brandKey).toBe('kazka');
    expect(greetingForBrandLock(lock)).toContain('Kazka Jewelry');
  });

  it('keeps Kazka S2S when no storefront host is present', () => {
    const lock = resolveChatBrandLock({
      contextOverride: {storefrontId: 'kazka', channel: 'hydrogen-kazka'},
      bodyBrand: 'epir',
    });
    expect(lock.side).toBe('kazka');
    expect(lock.source).toBe('ingress');
  });

  it('does not let a Kazka body brand override an EPIR storefront header', () => {
    const lock = resolveChatBrandLock({
      contextOverride: {storefrontId: 'online-store', channel: 'online-store'},
      bodyBrand: 'kazka',
      bodyStorefrontId: 'kazka',
    });
    expect(lock.side).toBe('epir');
    expect(greetingForBrandLock(lock)).not.toContain('Kazka Jewelry');
  });

  it('scopes Zaręczyny separately from EPIR and Kazka', () => {
    const lock = resolveChatBrandLock({
      contextOverride: {storefrontId: 'zareczyny', channel: 'hydrogen-zareczyny'},
      bodyBrand: 'kazka',
    });
    expect(lock.side).toBe('zareczyny');
    expect(lock.brandKey).toBe('zareczyny');
    expect(greetingForBrandLock(lock)).toContain('zaręczynowych');
    expect(greetingForBrandLock(lock)).not.toContain('Kazka Jewelry');
  });
});

describe('guardBuyerReply', () => {
  it('replaces a Kazka greeting on an EPIR turn', () => {
    const guarded = guardBuyerReply(
      'Witaj! Jestem Gemma, doradca marki Kazka Jewelry. Jak mogę Ci dzisiaj pomóc? ✨',
      {side: 'epir'},
    );
    expect(guarded.rewritten).toBe(true);
    expect(guarded.text).not.toContain('Kazka Jewelry');
    expect(guarded.text).toContain('EPIR Art Jewellery');
  });

  it('drops a Soliter recommendation on EPIR and keeps the rest of the reply', () => {
    const guarded = guardBuyerReply(
      'Mogę zostać przy złocie z tej kolekcji. Polecam Pierścionek Soliter.',
      {side: 'epir'},
    );
    expect(guarded.rewritten).toBe(true);
    expect(guarded.text).not.toMatch(/soliter/i);
    expect(guarded.text).toContain('złocie');
  });

  it('leaves a Kazka reply unchanged on the Kazka side', () => {
    const text = 'Witaj! Jestem Gemma, doradca marki Kazka Jewelry. Jak mogę Ci dzisiaj pomóc? ✨';
    const guarded = guardBuyerReply(text, {side: 'kazka'});
    expect(guarded.rewritten).toBe(false);
    expect(guarded.text).toBe(text);
  });
});

describe('projectHistoryForBrand', () => {
  it('rewrites a Kazka advisor turn for EPIR and leaves the stored role untouched', () => {
    const projected = projectHistoryForBrand(
      [
        {role: 'user', content: 'Hej'},
        {
          role: 'assistant',
          content: 'Witaj! Jestem Gemma, doradca marki Kazka Jewelry. Jak mogę Ci dzisiaj pomóc? ✨',
        },
        {role: 'assistant', content: 'Polecam Pierścionek Soliter.'},
        {role: 'tool', content: 'Pierścionek Soliter'},
      ],
      'epir',
    );
    expect(projected[0]).toEqual({role: 'user', content: 'Hej'});
    expect(projected[1]?.content).not.toContain('Kazka Jewelry');
    expect(String(projected[1]?.content)).toContain('EPIR Art Jewellery');
    expect(projected[2]?.content).not.toMatch(/soliter/i);
    expect(projected[3]?.content).toBe('Pierścionek Soliter');
  });

  it('keeps the Kazka greeting when the reader is Kazka', () => {
    const text = 'Witaj! Jestem Gemma, doradca marki Kazka Jewelry. Jak mogę Ci dzisiaj pomóc? ✨';
    const projected = projectHistoryForBrand([{role: 'assistant', content: text}], 'kazka');
    expect(projected[0]?.content).toBe(text);
  });
});
