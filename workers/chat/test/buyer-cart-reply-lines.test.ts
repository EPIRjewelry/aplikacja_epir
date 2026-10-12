import { describe, expect, it } from 'vitest';
import {
  buildCartContinueReply,
  formatCartLineSummaries,
} from '../src/buyer/cart-continue-reply';
import {
  createVariantOptionIndex,
  mergeProductFactsIntoIndex,
} from '../src/buyer/variant-option-gate';
import type { ProductFacts, VariantFacts } from '../src/facts/types';
import { sanitizeMarkdownLinks, collectAllowedUrls } from '../src/buyer/reply-link-guard';

describe('buildCartContinueReply line summaries', () => {
  const url = 'https://shop.myshopify.com/cart/c/TOKEN';

  it('shows name, rozmiar, quantity and total', () => {
    const reply = buildCartContinueReply({
      continueUrl: url,
      cartPayload: {
        line_items: [
          {
            quantity: 2,
            item: {
              id: 'gid://shopify/ProductVariant/18',
              title: 'Pierścionek Aurora',
              selected_options: [{ name: 'Rozmiar', value: '18' }],
            },
          },
        ],
        totals: [{ type: 'total', amount: 20000, currency: 'PLN' }],
        currency: 'PLN',
      },
      totalsNote: 'Suma szacunkowa: 200,00 zł (ostateczna kwota w kasie).',
      notices: ['Dostosowano ilość'],
    });
    expect(reply).toContain('Pierścionek Aurora');
    expect(reply).toContain('Rozmiar 18');
    expect(reply).toContain('2 szt.');
    expect(reply).toContain('Suma szacunkowa');
    expect(reply).toContain('Dostosowano ilość');
    expect(reply).toContain(url);
  });

  it('warning quantity_adjusted in notices', () => {
    const reply = buildCartContinueReply({
      continueUrl: url,
      notices: ['Dostosowano ilość'],
      cartPayload: {
        line_items: [
          { quantity: 1, item: { id: 'gid://shopify/ProductVariant/1', title: 'X' } },
        ],
      },
    });
    expect(reply).toContain('Dostosowano ilość');
  });

  it('no fabricated title when missing in payload and index', () => {
    const lines = formatCartLineSummaries({
      line_items: [{ quantity: 1, item: { id: 'gid://shopify/ProductVariant/unknown' } }],
    });
    expect(lines.some((l) => l.includes('Pozycja'))).toBe(false);
    expect(lines).toHaveLength(0);
  });

  it('title from catalog index when cart line has only variant id', () => {
    const index = createVariantOptionIndex();
    const product: ProductFacts = {
      channel: 'epir-online-store',
      productId: 'p1',
      handle: 'x',
      title: 'Z katalogu',
      vendor: 'EPIR',
      productType: null,
      url: 'https://epirbizuteria.pl/products/x',
      image: null,
      collections: [],
      descriptionText: '',
      options: [{ name: 'Rozmiar', values: ['18'] }],
      variants: [
        {
          variantId: 'gid://shopify/ProductVariant/18',
          title: '18',
          image: null,
          sku: null,
          price: { minor: 100, currency: 'PLN' },
          compareAtPrice: null,
          available: true,
          selectedOptions: [{ name: 'Rozmiar', value: '18' }],
          metal: null,
          size: '18',
          stoneOrigin: 'unknown',
          originEvidence: [],
        } as VariantFacts,
      ],
      priceRange: {
        min: { minor: 100, currency: 'PLN' },
        max: { minor: 100, currency: 'PLN' },
        isFlat: true,
      },
      stones: [],
      metals: [],
      sizes: ['18'],
      metafields: {},
      productOriginRaw: null,
      dataIssues: [],
    };
    mergeProductFactsIntoIndex(index, product);
    const lines = formatCartLineSummaries(
      {
        line_items: [{ quantity: 1, item: { id: 'gid://shopify/ProductVariant/18' } }],
      },
      index,
    );
    expect(lines[0]).toContain('Z katalogu');
    expect(lines[0]).toContain('Rozmiar 18');
  });
});

describe('sanitizeMarkdownLinks placeholders', () => {
  it('strips {{continue_url}} link, keeps label', () => {
    const allowed = collectAllowedUrls([
      'https://shop.myshopify.com/cart/c/REAL',
    ]);
    const out = sanitizeMarkdownLinks(
      'OK [Zakończ zamówienie]({{continue_url}}) i [Przejdź do koszyka](https://shop.myshopify.com/cart/c/REAL)',
      allowed,
    );
    expect(out).not.toContain('{{');
    expect(out).toContain('Zakończ zamówienie');
    expect(out).toContain('https://shop.myshopify.com/cart/c/REAL');
  });

  it('plain braces without markdown link unchanged', () => {
    const allowed = collectAllowedUrls([]);
    expect(sanitizeMarkdownLinks('foo {{bar}} baz', allowed)).toBe('foo {{bar}} baz');
  });
});
