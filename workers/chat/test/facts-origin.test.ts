import {describe, expect, it} from 'vitest';
import {normalizeProduct} from '../src/facts/normalize';

const base = {
  id: 'gid://shopify/Product/1',
  handle: 'ring-a',
  onlineStoreUrl: 'https://epirbizuteria.pl/products/ring-a',
  title: 'Pierścionek z kamieniem naturalnym',
  tags: ['kamienie naturalne w srebrze', 'pierścionek z kamieniem naturalnym'],
};

describe('facts origin resolution', () => {
  it('LAB → lab_grown; tags/title with naturalny do not change origin', () => {
    const p = normalizeProduct(
      {
        ...base,
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
      },
      {channel: 'epir'},
    );
    expect(p?.variants[0].stoneOrigin).toBe('lab_grown');
  });

  it('D/VVS2 → natural', () => {
    const p = normalizeProduct(
      {
        ...base,
        id: 'gid://shopify/Product/2',
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
    expect(p?.variants[0].stoneOrigin).toBe('natural');
  });

  it('unknown quality → unknown + DataIssue', () => {
    const p = normalizeProduct(
      {
        ...base,
        id: 'gid://shopify/Product/3',
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
    expect(p?.variants[0].stoneOrigin).toBe('unknown');
    expect(p?.dataIssues.some((i) => 'kind' in i && i.kind === 'unknown_quality_value')).toBe(true);
  });

  it('do wyboru without variant data → DataIssue', () => {
    const p = normalizeProduct(
      {
        ...base,
        id: 'gid://shopify/Product/4',
        metafields: {
          nodes: [{namespace: 'custom', key: 'gemstone_origin', value: 'do wyboru'}],
        },
        variants: {
          nodes: [
            {
              id: 'gid://shopify/ProductVariant/4',
              selectedOptions: [],
              price: {amount: '10.00', currencyCode: 'PLN'},
              availableForSale: true,
            },
          ],
        },
      },
      {channel: 'epir'},
    );
    expect(p?.dataIssues.some((i) => 'kind' in i && i.kind === 'origin_choice_unresolved')).toBe(true);
  });

  it('conflict option vs product metafield → DataIssue', () => {
    const p = normalizeProduct(
      {
        ...base,
        id: 'gid://shopify/Product/5',
        metafields: {
          nodes: [{namespace: 'custom', key: 'gemstone_origin', value: 'naturalny'}],
        },
        variants: {
          nodes: [
            {
              id: 'gid://shopify/ProductVariant/5',
              selectedOptions: [{name: 'Jakość', value: 'LAB'}],
              price: {amount: '10.00', currencyCode: 'PLN'},
              availableForSale: true,
            },
          ],
        },
      },
      {channel: 'epir'},
    );
    expect(p?.variants[0].stoneOrigin).toBe('lab_grown');
    expect(p?.dataIssues.some((i) => 'kind' in i && i.kind === 'origin_conflict')).toBe(true);
  });
});
