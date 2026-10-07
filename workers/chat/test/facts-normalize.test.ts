import {describe, expect, it} from 'vitest';
import {normalizeProduct} from '../src/facts/normalize';

describe('facts normalize', () => {
  it('skips GE product without onlineStoreUrl', () => {
    expect(
      normalizeProduct(
        {id: 'gid://shopify/Product/1', handle: 'draft-only', variants: {nodes: []}},
        {channel: 'epir'},
      ),
    ).toBeNull();
  });

  it('url, price grosze, SKU, image, collections; null image when missing', () => {
    const p = normalizeProduct(
      {
        id: 'gid://shopify/Product/2',
        handle: 'published',
        onlineStoreUrl: 'https://epirbizuteria.pl/products/published',
        featuredImage: {url: 'https://cdn.example/img.jpg', altText: 'alt'},
        collections: {nodes: [{handle: 'rings', title: 'Pierścionki'}]},
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
    expect(p?.variants[0].price.minor).toBe(12345);
    expect(p?.variants[0].sku).toBe('SKU-1');
    expect(p?.image?.url).toContain('cdn.example');
    expect(p?.collections.some((c) => c.handle === 'rings')).toBe(true);

    const noImg = normalizeProduct(
      {
        id: 'gid://shopify/Product/3',
        handle: 'no-img',
        onlineStoreUrl: 'https://epirbizuteria.pl/products/no-img',
        variants: {
          nodes: [
            {
              id: 'gid://shopify/ProductVariant/2',
              price: {amount: '1.00', currencyCode: 'PLN'},
              availableForSale: false,
            },
          ],
        },
      },
      {channel: 'epir'},
    );
    expect(noImg?.image).toBeNull();
    expect(noImg?.variants[0].image).toBeNull();
  });

  it('missing available → false + DataIssue', () => {
    const p = normalizeProduct(
      {
        id: 'gid://shopify/Product/4',
        handle: 'x',
        onlineStoreUrl: 'https://epirbizuteria.pl/products/x',
        variants: {
          nodes: [
            {
              id: 'gid://shopify/ProductVariant/9',
              price: {amount: '1.00', currencyCode: 'PLN'},
            },
          ],
        },
      },
      {channel: 'epir'},
    );
    expect(p?.variants[0].available).toBe(false);
    expect(p?.dataIssues.some((i) => 'kind' in i && i.kind === 'missing_availability')).toBe(true);
  });
});
