import { describe, expect, it } from 'vitest';

import {
  PRICING_MISMATCH_MAX_RATIO,
  PRICING_SAFE_FALLBACK_MESSAGE_PL,
  extractPlnAmountsFromAssistantText,
  extractProductHandleFromUrl,
  extractProductPriceRefsFromCatalogSnapshot,
  guardAssistantPricingAgainstCatalog,
} from '../src/pricing-guard';

const catalogSingleProduct = {
  products: [
    {
      handle: 'pierscionek-test',
      onlineStoreUrl: 'https://example.pl/products/pierscionek-test',
      priceRange: {
        minVariantPrice: { amount: '1999.00' },
      },
    },
  ],
};

describe('extractProductPriceRefsFromCatalogSnapshot', () => {
  it('interprets MCP-style integer minor PLN (28000 groszy) as 280 PLN for guard', () => {
    const snap = {
      products: [
        {
          handle: 'ring-minor',
          onlineStoreUrl: 'https://example.pl/products/ring-minor',
          priceRange: {
            minVariantPrice: { amount: 28000, currencyCode: 'PLN' },
          },
        },
      ],
    };
    const refs = extractProductPriceRefsFromCatalogSnapshot(snap);
    expect(refs.some((r) => r.handle === 'ring-minor' && r.amountPln === 280)).toBe(true);
  });

  it('collects amount + handle from flat product shape', () => {
    const refs = extractProductPriceRefsFromCatalogSnapshot(catalogSingleProduct);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.some((r) => r.handle === 'pierscionek-test' && r.amountPln === 1999)).toBe(true);
  });

  it('unwraps MCP-like { content: [{ text: JSON }] }', () => {
    const wrapped = {
      content: [{ text: JSON.stringify(catalogSingleProduct) }],
    };
    const refs = extractProductPriceRefsFromCatalogSnapshot(wrapped);
    expect(refs.some((r) => r.amountPln === 1999)).toBe(true);
  });
});

describe('extractProductHandleFromUrl / extractPlnAmountsFromAssistantText', () => {
  it('parses handle from product URL', () => {
    expect(extractProductHandleFromUrl('https://shop.pl/products/foo-bar?x=1')).toBe('foo-bar');
  });

  it('extracts PLN amounts with Polish spacing', () => {
    expect(extractPlnAmountsFromAssistantText('To kosztuje 1 999 zł brutto.')).toEqual([1999]);
    expect(extractPlnAmountsFromAssistantText('A i 500 zł też.')).toEqual([500]);
  });
});

describe('guardAssistantPricingAgainstCatalog', () => {
  it('passes when stated price matches catalog (single ref)', () => {
    const text = 'Polecam pierścionek za 1 999 zł.';
    const out = guardAssistantPricingAgainstCatalog(text, [catalogSingleProduct], {
      maxRatio: PRICING_MISMATCH_MAX_RATIO,
      sessionId: 's1',
    });
    expect(out.sanitized).toBe(false);
    expect(out.text).toBe(text);
  });

  it('sanitizes when single-catalog price deviates beyond threshold', () => {
    const text = 'Ten pierścionek to około 500 zł.';
    const out = guardAssistantPricingAgainstCatalog(text, [catalogSingleProduct]);
    expect(out.sanitized).toBe(true);
    expect(out.text).toBe(PRICING_SAFE_FALLBACK_MESSAGE_PL);
    expect(out.log?.tag).toBe('chat.pricing_mismatch');
    expect(out.log?.reason).toBe('single_catalog_price_global_deviation');
    expect(out.log?.catalog_amount).toBe(1999);
    expect(out.log?.stated_amount).toBe(500);
  });

  it('flags markdown link chunk price vs catalog for that product', () => {
    const text =
      'Zobacz [Pierścionek](https://example.pl/products/pierscionek-test) — około 400 zł.';
    const out = guardAssistantPricingAgainstCatalog(text, [catalogSingleProduct]);
    expect(out.sanitized).toBe(true);
    expect(out.log?.reason).toBe('markdown_link_price_deviation');
    expect(out.log?.handle).toBe('pierscionek-test');
  });

  it('allows nearest-reference match when multiple catalog prices exist', () => {
    const multi = {
      products: [
        {
          handle: 'a',
          onlineStoreUrl: 'https://x.pl/products/a',
          priceRange: { minVariantPrice: { amount: '1000' } },
        },
        {
          handle: 'b',
          onlineStoreUrl: 'https://x.pl/products/b',
          priceRange: { minVariantPrice: { amount: '5000' } },
        },
      ],
    };
    const text = 'Drugi wariant to około 5 000 zł.';
    const out = guardAssistantPricingAgainstCatalog(text, [multi]);
    expect(out.sanitized).toBe(false);
  });

  it('sanitizes when nearest catalog ref is still too far', () => {
    const multi = {
      products: [
        {
          handle: 'a',
          onlineStoreUrl: 'https://x.pl/products/a',
          priceRange: { minVariantPrice: { amount: '1000' } },
        },
        {
          handle: 'b',
          onlineStoreUrl: 'https://x.pl/products/b',
          priceRange: { minVariantPrice: { amount: '2000' } },
        },
      ],
    };
    const text = 'Cena około 9 999 zł.';
    const out = guardAssistantPricingAgainstCatalog(text, [multi]);
    expect(out.sanitized).toBe(true);
    expect(out.log?.reason).toBe('nearest_reference_deviation');
  });

  it('sanitizes when model states 100× wrong PLN vs normalized catalog (28000 vs 280 PLN)', () => {
    const snap = {
      products: [
        {
          handle: 'x',
          onlineStoreUrl: 'https://example.pl/products/x',
          priceRange: {
            minVariantPrice: { amount: 28000, currencyCode: 'PLN' },
          },
        },
      ],
    };
    const out = guardAssistantPricingAgainstCatalog('Ten pierścionek kosztuje 28 000 zł.', [snap]);
    expect(out.sanitized).toBe(true);
  });

  it('passes when model states correct PLN after minor normalization', () => {
    const snap = {
      products: [
        {
          handle: 'x',
          onlineStoreUrl: 'https://example.pl/products/x',
          priceRange: {
            minVariantPrice: { amount: 28000, currencyCode: 'PLN' },
          },
        },
      ],
    };
    const out = guardAssistantPricingAgainstCatalog('Cena około 280 zł.', [snap]);
    expect(out.sanitized).toBe(false);
  });

  it('no-ops with empty snapshots', () => {
    const out = guardAssistantPricingAgainstCatalog('500 zł', []);
    expect(out.sanitized).toBe(false);
  });
});
