import {describe, expect, it} from 'vitest';
import {normalizeProduct} from '../src/facts/normalize';

describe('facts normalize', () => {
  it('skips GE product without onlineStoreUrl', () => {
    const p = normalizeProduct(
      {id: 'gid://shopify/Product/1', handle: 'draft-only', variants: {nodes: []}},
      {channel: 'epir'},
    );
    expect(p).toBeNull();
  });

  it('builds url from onlineStoreUrl and price in grosze', () => {
    const p = normalizeProduct(
      {
        id: 'gid://shopify/Product/2',
        handle: 'published',
        onlineStoreUrl: 'https://epirbizuteria.pl/products/published',
        featuredImage: {url: 'https://cdn.example/img.jpg', altText: 'alt'},
        collections: {nodes: [{handle: 'rings'}]},
        variants: {
          nodes: [
            {
              id: 'gid://shopify/ProductVariant/1',
              sku: 'SKU-1',
              price: {amount: '123.45', currencyCode: 'PLN'},
              availableForSale: true,
            },
          ],
        },
      },
      {channel: 'epir'},
    );
    expect(p?.url).toBe('https://epirbizuteria.pl/products/published');
    expect(p?.variants[0].price?.amount_minor).toBe(12345);
    expect(p?.variants[0].sku).toBe('SKU-1');
    expect(p?.image?.url).toContain('cdn.example');
    expect(p?.collections).toContain('rings');
  });
});
