import {beforeEach, describe, expect, it, vi} from 'vitest';
import {searchGemmaCatalog} from '../../../src/gemma/facts/catalog-search';
import * as facts from '../../../src/facts';
import * as shopSuggest from '../../../src/facts/shop-suggest';
import * as storefrontLive from '../../../src/facts/storefront-live';
import {moneyFromMinor} from '../../../src/facts/types';
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

describe('UCP + Storefront search(PRODUCT) merge (S3)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-S3-SF-MERGE-1: UCP bez targetu + SF search z targetem → hyd zawiera @340', async () => {
    const galazki = silverGarnetRing('pierscionek-galazki-z-granatem', 32_000);
    const kwiat = silverGarnetRing('pierscionek-kwiat-z-granatem', 32_000);
    const target = silverGarnetRing('pierscionek-srebrny-z-granatem', 34_000);

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
      {id: target.productId, handle: target.handle},
      {id: galazki.productId, handle: galazki.handle},
    ]);
    vi.spyOn(storefrontLive, 'fetchProductFactsLive').mockResolvedValue([target]);
    vi.spyOn(shopSuggest, 'fetchShopSuggestProductHandles').mockResolvedValue([]);

    const out = await searchGemmaCatalog(
      {SHOP_DOMAIN: 'x', PRIVATE_STOREFRONT_API_TOKEN: 't'} as never,
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

    expect(storefrontLive.searchStorefrontProductRefsByQuery).toHaveBeenCalled();
    expect(out.some((m) => m.product.handle === 'pierscionek-srebrny-z-granatem')).toBe(true);
    const targetMatch = out.find((m) => m.product.handle === 'pierscionek-srebrny-z-granatem');
    expect(targetMatch?.matchingPriceRange.min.minor).toBe(34_000);
  });
});
