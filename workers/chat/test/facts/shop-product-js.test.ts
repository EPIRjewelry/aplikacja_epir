import {afterEach, describe, expect, it, vi} from 'vitest';
import {productFactsProductTypeMatchesSlots} from '../../src/facts/product-type-buyer-taxonomy';
import {
  fetchShopAjaxProductJson,
  productFactsFromShopAjaxJson,
} from '../../src/facts/shop-product-js';
import {fictionalAjaxSilverGarnetRing} from '../fixtures/ajax-silver-garnet-ring';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shop Ajax product.js', () => {
  it('T-AJAX-1: maps variants (minor price) to ProductFacts', () => {
    const facts = productFactsFromShopAjaxJson(
      fictionalAjaxSilverGarnetRing(),
      'epir-online-store',
      'pierscionek-srebrny-z-granatem',
      'https://epirbizuteria.pl',
    );
    expect(facts).not.toBeNull();
    expect(facts!.handle).toBe('pierscionek-srebrny-z-granatem');
    expect(facts!.productId).toBe('gid://shopify/Product/6836886012009');
    expect(facts!.variants[0]?.price.minor).toBe(34_000);
    expect(facts!.variants[0]?.metal).toBe('srebro 925');
  });

  it('T-AJAX-2: fetch 404 → null, no throw', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', {status: 404}));
    await expect(
      fetchShopAjaxProductJson('epir-online-store', 'missing-handle-xyz'),
    ).resolves.toBeNull();
  });

  it('T-AJAX-3: empty product type → soft-keep PT slot pierścionek', () => {
    const facts = productFactsFromShopAjaxJson(
      fictionalAjaxSilverGarnetRing(),
      'epir-online-store',
      'pierscionek-srebrny-z-granatem',
      'https://epirbizuteria.pl',
    );
    expect(facts).not.toBeNull();
    expect(productFactsProductTypeMatchesSlots(facts!.productType, ['pierścionek'])).toBe(true);
  });
});
