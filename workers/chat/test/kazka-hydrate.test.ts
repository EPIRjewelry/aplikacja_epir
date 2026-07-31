import {describe, expect, it} from 'vitest';
import {parseStorefrontPathContext} from '../src/storefront/path-context';
import {
  formatKazkaCollectionContext,
  formatKazkaProductContext,
  isKazkaHeadlessChannel,
} from '../src/storefront/kazka-hydrate';

describe('parseStorefrontPathContext', () => {
  it('parses collection and product paths', () => {
    expect(parseStorefrontPathContext('/collections/kazka-pierscionki')).toEqual({
      collectionHandle: 'kazka-pierscionki',
    });
    expect(parseStorefrontPathContext('/products/soliter')).toEqual({
      productHandle: 'soliter',
    });
  });
});

describe('isKazkaHeadlessChannel', () => {
  it('recognizes kazka storefront and channels', () => {
    expect(isKazkaHeadlessChannel('hydrogen-kazka')).toBe(true);
    expect(isKazkaHeadlessChannel('kazka_headless')).toBe(true);
    expect(isKazkaHeadlessChannel(undefined, 'kazka')).toBe(true);
    expect(isKazkaHeadlessChannel('online-store')).toBe(false);
  });
});

describe('formatKazkaProductContext', () => {
  it('includes title handle and price', () => {
    const text = formatKazkaProductContext({
      id: 'gid://shopify/Product/1',
      handle: 'soliter',
      title: 'Pierścionek Soliter',
      description: 'Opis testowy',
      variants: {
        nodes: [
          {
            id: 'v1',
            title: 'Default',
            availableForSale: true,
            price: {amount: '280.0', currencyCode: 'PLN'},
          },
        ],
      },
    });
    expect(text).toContain('Pierścionek Soliter');
    expect(text).toContain('handle: soliter');
    expect(text).toContain('280.0 zł');
  });
});

describe('formatKazkaCollectionContext', () => {
  it('lists products in collection', () => {
    const text = formatKazkaCollectionContext(
      {handle: 'kazka-pierscionki', title: 'Pierścionki'},
      [
        {
          id: '1',
          handle: 'a',
          title: 'Produkt A',
          variants: {
            nodes: [
              {
                id: 'v',
                title: 'Default',
                availableForSale: true,
                price: {amount: '100', currencyCode: 'PLN'},
              },
            ],
          },
        },
      ],
    );
    expect(text).toContain('Pierścionki');
    expect(text).toContain('Produkt A');
  });
});
