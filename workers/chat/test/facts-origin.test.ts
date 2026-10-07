import {describe, expect, it} from 'vitest';
import {normalizeProduct} from '../src/facts/normalize';

describe('facts origin resolution', () => {
  it('LAB option → lab_grown', () => {
    const p = normalizeProduct(
      {
        id: 'gid://shopify/Product/1',
        handle: 'ring-a',
        onlineStoreUrl: 'https://epirbizuteria.pl/products/ring-a',
        variants: {
          nodes: [
            {
              id: 'gid://shopify/ProductVariant/1',
              selectedOptions: [{name: 'Jakość', value: 'LAB'}],
              price: {amount: '100.00', currencyCode: 'PLN'},
              availableForSale: true,
            },
          ],
        },
        tags: ['kamień naturalny'],
        title: 'Pierścionek naturalny',
      },
      {channel: 'epir'},
    );
    expect(p?.variants[0].origin).toBe('lab_grown');
  });

  it('D/VVS2 → natural', () => {
    const p = normalizeProduct(
      {
        id: 'gid://shopify/Product/2',
        handle: 'ring-b',
        onlineStoreUrl: 'https://epirbizuteria.pl/products/ring-b',
        variants: {
          nodes: [
            {
              id: 'gid://shopify/ProductVariant/2',
              selectedOptions: [{name: 'Jakość', value: 'D/VVS2'}],
              price: {amount: '200.00', currencyCode: 'PLN'},
              availableForSale: true,
            },
          ],
        },
      },
      {channel: 'epir'},
    );
    expect(p?.variants[0].origin).toBe('natural');
  });

  it('unknown quality adds DataIssue', () => {
    const p = normalizeProduct(
      {
        id: 'gid://shopify/Product/3',
        handle: 'ring-c',
        onlineStoreUrl: 'https://epirbizuteria.pl/products/ring-c',
        variants: {
          nodes: [
            {
              id: 'gid://shopify/ProductVariant/3',
              selectedOptions: [{name: 'Jakość', value: 'MYSTERY'}],
              price: {amount: '50.00', currencyCode: 'PLN'},
              availableForSale: true,
            },
          ],
        },
      },
      {channel: 'epir'},
    );
    expect(p?.variants[0].origin).toBe('unknown');
    expect(p?.issues.some((i) => i.field === 'variant_option_quality')).toBe(true);
  });
});
