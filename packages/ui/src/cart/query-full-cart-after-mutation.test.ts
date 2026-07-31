import {describe, expect, it, vi} from 'vitest';
import {queryFullCartAfterMutation} from './query-full-cart-after-mutation';

describe('queryFullCartAfterMutation', () => {
  it('returns cart when first query has lines and cost', async () => {
    const fullCart = {id: 'c1', lines: {edges: []}, cost: {subtotalAmount: {}}};
    const storefront = {
      i18n: {country: 'PL', language: 'PL'},
      CacheNone: () => ({}),
      query: vi.fn().mockResolvedValue({cart: fullCart}),
    };

    const result = await queryFullCartAfterMutation(
      storefront as never,
      'gid://shopify/Cart/1',
      'query',
    );

    expect(result).toEqual(fullCart);
    expect(storefront.query).toHaveBeenCalledTimes(1);
  });

  it('retries until full cart payload is available', async () => {
    const stub = {id: 'c1', totalQuantity: 1};
    const fullCart = {
      id: 'c1',
      totalQuantity: 1,
      lines: {edges: [{node: {id: 'line'}}]},
      cost: {subtotalAmount: {amount: '10', currencyCode: 'PLN'}},
    };
    const storefront = {
      i18n: {country: 'PL', language: 'PL'},
      CacheNone: () => ({}),
      query: vi
        .fn()
        .mockResolvedValueOnce({cart: stub})
        .mockResolvedValueOnce({cart: fullCart}),
    };

    const result = await queryFullCartAfterMutation(
      storefront as never,
      'gid://shopify/Cart/1',
      'query',
      3,
    );

    expect(result).toEqual(fullCart);
    expect(storefront.query).toHaveBeenCalledTimes(2);
  });
});
