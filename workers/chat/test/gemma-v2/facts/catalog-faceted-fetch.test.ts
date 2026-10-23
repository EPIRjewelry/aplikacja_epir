import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  fetchGemmaCatalogMatchesForTurn,
  resolveGemmaCatalogFetchLimit,
  sortMatchesClosestToPriceMax,
  slotsHaveProductTypeMetalAndStone,
} from '../../../src/gemma/facts/catalog-fetch-for-turn';
import {
  GEMMA_CATALOG_DISPLAY_LIMIT,
  GEMMA_FACETED_CATALOG_FETCH_LIMIT,
} from '../../../src/gemma/actions/catalog-limits';
import * as facts from '../../../src/facts';
import {moneyFromMinor} from '../../../src/facts/types';
import {
  fictionalMatchFromProduct,
  fictionalMultiVariantProduct,
} from '../fixtures/fictional-catalog-products';

function ringProduct(handle: string, minor: number, metal = 'srebro 925') {
  const base = fictionalMultiVariantProduct();
  return {
    ...base,
    handle,
    productType: 'Pierścionek',
    stones: ['Granat'],
    variants: [
      {
        ...base.variants[0],
        metal,
        price: moneyFromMinor(minor),
        variantId: `gid://shopify/ProductVariant/${handle}`,
      },
    ],
  };
}

describe('faceted UCP fetch (S3 PT∧metal∧stone)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-S3-FACET-1: slots PT∧metal∧stone → fetch limit 24', () => {
    expect(
      slotsHaveProductTypeMetalAndStone({
        product_type: 'pierścionek',
        metal: 'srebrny',
        stone: 'granat',
      }),
    ).toBe(true);
    expect(
      resolveGemmaCatalogFetchLimit(
        {product_type: 'pierścionek', metal: 'srebrny', stone: 'granat'},
        false,
      ),
    ).toBe(GEMMA_FACETED_CATALOG_FETCH_LIMIT);
    expect(resolveGemmaCatalogFetchLimit({metal: 'złoto', budget: 5000}, false)).toBe(
      GEMMA_CATALOG_DISPLAY_LIMIT,
    );
  });

  it('T-S3-FACET-2: target poza top-6 UCP → hyd po limit 24 + sort do budget', async () => {
    const cheap = [
      ringProduct('pierscionek-galazki-z-granatem', 32_000),
      ringProduct('pierscionek-kwiat-z-granatem', 32_000),
      ringProduct('filler-a', 30_000),
      ringProduct('filler-b', 30_000),
      ringProduct('filler-c', 30_000),
      ringProduct('filler-d', 30_000),
    ];
    const target = ringProduct('pierscionek-srebrny-z-granatem', 34_000);
    const beyondTop6 = [target, ringProduct('filler-e', 33_000)];
    const all = [...cheap, ...beyondTop6];

    const searchSpy = vi.fn().mockImplementation(async (_filters, limit: number) => {
      const slice = all.slice(0, limit).map((p) => fictionalMatchFromProduct(p));
      return {
        matches: slice,
        total: slice.length,
        facets: {
          total: slice.length,
          byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
          byStone: {},
          byMetal: {},
          byProductType: {},
        },
      };
    });
    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({search: searchSpy} as never);

    const top = await fetchGemmaCatalogMatchesForTurn({
      env: {SHOP_DOMAIN: 'x'} as never,
      channelId: 'epir-online-store',
      slots: {
        product_type: 'pierścionek',
        metal: 'srebrny',
        stone: 'granat',
        budget: 340,
      },
      userCorpus: 'pierścionek srebrny z granatem za 340 zł',
    });

    expect(searchSpy).toHaveBeenCalledWith(expect.anything(), GEMMA_FACETED_CATALOG_FETCH_LIMIT);
    expect(top.some((t) => t.match.product.handle === 'pierscionek-srebrny-z-granatem')).toBe(
      true,
    );
    expect(top[0]?.match.product.handle).toBe('pierscionek-srebrny-z-granatem');
    expect(top.length).toBeLessThanOrEqual(GEMMA_CATALOG_DISPLAY_LIMIT);
  });

  it('T-S3-FACET-3: sortMatchesClosestToPriceMax prefers 340 over 320', () => {
    const priced = [
      {match: fictionalMatchFromProduct(ringProduct('a', 32_000)), minMinor: 32_000},
      {match: fictionalMatchFromProduct(ringProduct('b', 34_000)), minMinor: 34_000},
    ];
    const sorted = sortMatchesClosestToPriceMax(priced, 34_000);
    expect(sorted[0].minMinor).toBe(34_000);
  });
});
