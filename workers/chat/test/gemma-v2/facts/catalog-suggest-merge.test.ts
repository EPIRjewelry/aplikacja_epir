import {beforeEach, describe, expect, it, vi} from 'vitest';
import {searchGemmaCatalog} from '../../../src/gemma/facts/catalog-search';
import * as facts from '../../../src/facts';
import * as storefrontLive from '../../../src/facts/storefront-live';
import * as shopSuggest from '../../../src/facts/shop-suggest';
import {moneyFromMinor} from '../../../src/facts/types';
import {productFactsFromShopAjaxJson} from '../../../src/facts/shop-product-js';
import {fictionalAjaxSilverGarnetRing} from '../../fixtures/ajax-silver-garnet-ring';
import {
  fictionalMatchFromProduct,
  fictionalMultiVariantProduct,
} from '../fixtures/fictional-catalog-products';

function silverGarnetRing(handle: string, minor: number) {
  const base = fictionalMultiVariantProduct();
  return {
    ...base,
    productId: `gid://shopify/Product/${handle}`,
    handle,
    productType: 'Pierścionek',
    stones: ['Granat'],
    variants: [
      {
        ...base.variants[0],
        metal: 'srebro 925',
        price: moneyFromMinor(minor),
        variantId: `gid://shopify/ProductVariant/${handle}`,
      },
    ],
  };
}

function mockStorefrontNullAndAjaxJs() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('graphql.json')) {
      return new Response(JSON.stringify({data: {product: null}}), {status: 200});
    }
    if (url.endsWith('/products/pierscionek-srebrny-z-granatem.js')) {
      return new Response(JSON.stringify(fictionalAjaxSilverGarnetRing()), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      });
    }
    return new Response('not found', {status: 404});
  });
}

describe('UCP + SF search + shop suggest merge (S3)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-S3-SUGGEST-1: suggest handle + SF null + .js → hyd @340 w merge', async () => {
    const galazki = silverGarnetRing('pierscionek-galazki-z-granatem', 32_000);
    const kwiat = silverGarnetRing('pierscionek-kwiat-z-granatem', 32_000);

    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: vi.fn().mockResolvedValue({
        matches: [fictionalMatchFromProduct(galazki), fictionalMatchFromProduct(kwiat)],
        total: 2,
        facets: {
          total: 2,
          byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
          byStone: {},
          byMetal: {},
          byProductType: {},
        },
      }),
    } as never);
    vi.spyOn(storefrontLive, 'searchStorefrontProductRefsByQuery').mockResolvedValue([
      {id: galazki.productId, handle: galazki.handle},
    ]);
    vi.spyOn(storefrontLive, 'fetchProductFactsLive').mockResolvedValue([]);
    vi.spyOn(shopSuggest, 'fetchShopSuggestProductHandles').mockResolvedValue([
      'pierscionek-galazki-z-granatem',
      'pierscionek-srebrny-z-granatem',
      'pierscionek-kwiat-z-granatem',
    ]);
    mockStorefrontNullAndAjaxJs();

    const out = await searchGemmaCatalog(
      {
        SHOP_DOMAIN: 'epir-ai.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN: 't',
      } as never,
      'epir-online-store',
      {
        text: 'pierścionek srebro granat',
        productType: ['pierścionek'],
        metal: ['srebrny'],
        stone: ['granat'],
        priceMax: moneyFromMinor(34_000),
      },
      24,
    );

    expect(shopSuggest.fetchShopSuggestProductHandles).toHaveBeenCalled();
    expect(out.some((m) => m.product.handle === 'pierscionek-srebrny-z-granatem')).toBe(true);
    expect(
      out.find((m) => m.product.handle === 'pierscionek-srebrny-z-granatem')?.matchingPriceRange.min
        .minor,
    ).toBe(34_000);
  });

  it('T-S3-SUGGEST-UPGRADE-1: UCP ma productId (słabe @320) → suggest+.js upgrade @340', async () => {
    const galazki = silverGarnetRing('pierscionek-galazki-z-granatem', 32_000);
    const weakTargetId = 'gid://shopify/Product/6836886012009';
    const weakTarget = {
      ...silverGarnetRing('pierscionek-galazki-z-granatem', 32_000),
      productId: weakTargetId,
      handle: 'pierscionek-galazki-z-granatem',
      variants: [
        {
          ...fictionalMultiVariantProduct().variants[0],
          metal: null,
          price: moneyFromMinor(32_000),
          variantId: 'gid://shopify/ProductVariant/weak-target',
        },
      ],
    };
    const upgraded = productFactsFromShopAjaxJson(
      fictionalAjaxSilverGarnetRing(),
      'epir-online-store',
      'pierscionek-srebrny-z-granatem',
      'https://epirbizuteria.pl',
    )!;

    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: vi.fn().mockResolvedValue({
        matches: [fictionalMatchFromProduct(galazki), fictionalMatchFromProduct(weakTarget)],
        total: 2,
        facets: {
          total: 2,
          byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
          byStone: {},
          byMetal: {},
          byProductType: {},
        },
      }),
    } as never);
    vi.spyOn(storefrontLive, 'searchStorefrontProductRefsByQuery').mockResolvedValue([]);
    vi.spyOn(storefrontLive, 'fetchProductFactsLive').mockResolvedValue([]);
    vi.spyOn(shopSuggest, 'fetchShopSuggestProductHandles').mockResolvedValue([
      'pierscionek-srebrny-z-granatem',
    ]);
    vi.spyOn(storefrontLive, 'fetchProductFactsByHandle').mockResolvedValue(upgraded);

    const out = await searchGemmaCatalog(
      {
        SHOP_DOMAIN: 'epir-ai.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN: 't',
      } as never,
      'epir-online-store',
      {
        text: 'pierścionek srebro granat',
        productType: ['pierścionek'],
        metal: ['srebrny'],
        stone: ['granat'],
        priceMax: moneyFromMinor(34_000),
      },
      24,
    );

    const target = out.find((m) => m.product.productId === weakTargetId);
    expect(target?.product.handle).toBe('pierscionek-srebrny-z-granatem');
    expect(target?.matchingPriceRange.min.minor).toBe(34_000);
  });
});
