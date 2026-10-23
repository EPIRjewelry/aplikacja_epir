import {beforeEach, describe, expect, it, vi} from 'vitest';
import {searchGemmaCatalog} from '../../../src/gemma/facts/catalog-search';
import * as facts from '../../../src/facts';
import * as shopProductJs from '../../../src/facts/shop-product-js';
import * as storefrontLive from '../../../src/facts/storefront-live';
import * as shopSuggest from '../../../src/facts/shop-suggest';
import {moneyFromMinor} from '../../../src/facts/types';
import {productFactsFromShopAjaxJson} from '../../../src/facts/shop-product-js';
import {
  fictionalAjaxSilverGarnetRing,
  fictionalAjaxSilverGarnetRingSizeOnly,
} from '../../fixtures/ajax-silver-garnet-ring';
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

function mockAjaxJsFetch() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
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

  it('T-S3-SUGGEST-1: suggest handle + Ajax .js → hyd @340 w merge', async () => {
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
    mockAjaxJsFetch();

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
    vi.spyOn(shopProductJs, 'fetchProductFactsFromShopAjax').mockResolvedValue(upgraded);

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

  it('T-S3-SUGGEST-NO-PT-1: metal+stone+budget bez productType → suggest+upgrade @340', async () => {
    const galazki = silverGarnetRing('pierscionek-galazki-z-granatem', 32_000);
    const weakTargetId = 'gid://shopify/Product/6836886012009';
    const weakTarget = {
      ...silverGarnetRing('srebrny-pierscionek-z-granatem', 28_000),
      productId: weakTargetId,
      handle: 'srebrny-pierscionek-z-granatem',
    };
    const upgraded = productFactsFromShopAjaxJson(
      fictionalAjaxSilverGarnetRing(),
      'epir-online-store',
      'pierscionek-srebrny-z-granatem',
      'https://epirbizuteria.pl',
    )!;

    const suggestSpy = vi
      .spyOn(shopSuggest, 'fetchShopSuggestProductHandles')
      .mockResolvedValue(['pierscionek-srebrny-z-granatem']);
    const sfSearchSpy = vi.spyOn(storefrontLive, 'searchStorefrontProductRefsByQuery');
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
    vi.spyOn(shopProductJs, 'fetchProductFactsFromShopAjax').mockResolvedValue(upgraded);

    const out = await searchGemmaCatalog(
      {
        SHOP_DOMAIN: 'epir-ai.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN: 't',
      } as never,
      'epir-online-store',
      {
        text: 'srebro granat',
        metal: ['srebrny'],
        stone: ['granat'],
        priceMax: moneyFromMinor(34_000),
      },
      24,
    );

    expect(suggestSpy).toHaveBeenCalled();
    expect(sfSearchSpy).not.toHaveBeenCalled();
    const target = out.find((m) => m.product.handle === 'pierscionek-srebrny-z-granatem');
    expect(target?.matchingPriceRange.min.minor).toBe(34_000);
  });

  it('T-S3-SUGGEST-HAVE-HANDLE-1: haveHandles ma target → Ajax upgrade @340 (nie skip)', async () => {
    const weakOnHandle = {
      ...silverGarnetRing('pierscionek-srebrny-z-granatem', 32_000),
      productId: 'gid://shopify/Product/6836886012009',
      variants: [
        {
          ...fictionalMultiVariantProduct().variants[0],
          metal: null,
          price: moneyFromMinor(32_000),
          variantId: 'gid://shopify/ProductVariant/weak-same-handle',
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
        matches: [fictionalMatchFromProduct(weakOnHandle)],
        total: 1,
        facets: {
          total: 1,
          byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
          byStone: {},
          byMetal: {},
          byProductType: {},
        },
      }),
    } as never);
    vi.spyOn(storefrontLive, 'searchStorefrontProductRefsByQuery').mockResolvedValue([]);
    vi.spyOn(shopSuggest, 'fetchShopSuggestProductHandles').mockResolvedValue([
      'pierscionek-srebrny-z-granatem',
    ]);
    const ajaxSpy = vi.spyOn(shopProductJs, 'fetchProductFactsFromShopAjax').mockResolvedValue(
      upgraded,
    );
    const byHandleSpy = vi.spyOn(storefrontLive, 'fetchProductFactsByHandle');

    const out = await searchGemmaCatalog(
      {
        SHOP_DOMAIN: 'epir-ai.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN: 't',
      } as never,
      'epir-online-store',
      {
        text: 'srebro granat',
        metal: ['srebrny'],
        stone: ['granat'],
        priceMax: moneyFromMinor(34_000),
      },
      24,
    );

    expect(ajaxSpy).toHaveBeenCalledWith(
      'epir-online-store',
      'pierscionek-srebrny-z-granatem',
      'epir-online-store',
    );
    expect(byHandleSpy).not.toHaveBeenCalled();
    expect(out).toHaveLength(1);
    expect(out[0].matchingPriceRange.min.minor).toBe(34_000);
  });

  it('T-S3-SUGGEST-AJAX-PATH-1: SF EN taxonomy w UCP → Ajax upgrade soft-keep @340 post-UCP', async () => {
    const weakTargetId = 'gid://shopify/Product/6836886012009';
    const weakSfTaxonomy = {
      ...silverGarnetRing('pierscionek-srebrny-z-granatem', 32_000),
      productId: weakTargetId,
      stones: [],
      metafields: {
        'shopify.gemstone-type': 'Garnet',
        'shopify.jewelry-material': 'Sterling silver',
      },
      variants: [
        {
          ...fictionalMultiVariantProduct().variants[0],
          metal: null,
          price: moneyFromMinor(32_000),
          variantId: 'gid://shopify/ProductVariant/weak-en-taxonomy',
        },
      ],
    };
    const ajaxSoftKeep = productFactsFromShopAjaxJson(
      fictionalAjaxSilverGarnetRingSizeOnly(),
      'epir-online-store',
      'pierscionek-srebrny-z-granatem',
      'https://epirbizuteria.pl',
    )!;

    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: vi.fn().mockResolvedValue({
        matches: [fictionalMatchFromProduct(weakSfTaxonomy)],
        total: 1,
        facets: {
          total: 1,
          byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
          byStone: {},
          byMetal: {},
          byProductType: {},
        },
      }),
    } as never);
    vi.spyOn(storefrontLive, 'searchStorefrontProductRefsByQuery').mockResolvedValue([]);
    vi.spyOn(shopSuggest, 'fetchShopSuggestProductHandles').mockResolvedValue([
      'pierscionek-srebrny-z-granatem',
    ]);
    const ajaxSpy = vi
      .spyOn(shopProductJs, 'fetchProductFactsFromShopAjax')
      .mockResolvedValue(ajaxSoftKeep);
    const byHandleSpy = vi.spyOn(storefrontLive, 'fetchProductFactsByHandle');

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
        priceMax: moneyFromMinor(40_000),
      },
      24,
    );

    expect(ajaxSpy).toHaveBeenCalled();
    expect(byHandleSpy).not.toHaveBeenCalled();
    expect(out).toHaveLength(1);
    expect(out[0].product.handle).toBe('pierscionek-srebrny-z-granatem');
    expect(out[0].matchingPriceRange.min.minor).toBe(34_000);
  });
});
