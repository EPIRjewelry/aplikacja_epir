import {describe, expect, it} from 'vitest';
import {normalizeProductFacts} from '../src/facts/normalize-product';

describe('normalizeProductFacts', () => {
  it('includes image and collections on product and variant', () => {
    const facts = normalizeProductFacts(
      {
        id: 'gid://shopify/Product/1',
        handle: 'pierscionek-test',
        title: 'Pierścionek test',
        onlineStoreUrl: 'https://epirbizuteria.pl/products/pierscionek-test',
        status: 'ACTIVE',
        featuredImage: {url: 'https://cdn.shopify.com/hero.jpg', altText: 'Hero'},
        collections: {nodes: [{handle: 'pierscienniki'}, {handle: 'prezenty'}]},
        variants: {
          nodes: [
            {
              id: 'gid://shopify/ProductVariant/10',
              title: '14',
              availableForSale: true,
              price: {amount: '1200.00', currencyCode: 'PLN'},
              image: {url: 'https://cdn.shopify.com/v14.jpg'},
              selectedOptions: [{name: 'Rozmiar', value: '14'}, {name: 'Metal', value: 'złoto 585'}],
            },
          ],
        },
      },
      {brand: 'epir'},
    );

    expect(facts).not.toBeNull();
    expect(facts!.collections).toEqual(['pierscienniki', 'prezenty']);
    expect(facts!.image?.url).toContain('hero.jpg');
    expect(facts!.variants[0]?.image?.url).toContain('v14.jpg');
    expect(facts!.variants[0]?.size).toBe('14');
    expect(facts!.variants[0]?.metal).toMatch(/złoto/i);
    expect(facts!.variants[0]?.price_display_pl).toMatch(/1\s*200/);
  });

  it('drops non-live EPIR products without onlineStoreUrl', () => {
    const facts = normalizeProductFacts(
      {
        id: 'gid://shopify/Product/2',
        handle: 'draft-only',
        title: 'Draft',
        status: 'ACTIVE',
        variants: {nodes: []},
      },
      {brand: 'epir'},
    );
    expect(facts).toBeNull();
  });
});
