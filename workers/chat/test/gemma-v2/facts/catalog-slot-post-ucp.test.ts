import {beforeEach, describe, expect, it, vi} from 'vitest';
import {searchGemmaCatalog} from '../../../src/gemma/facts/catalog-search';
import * as facts from '../../../src/facts';
import {moneyFromMinor} from '../../../src/facts/types';
import {
  fictionalMatchFromProduct,
  fictionalMultiVariantProduct,
} from '../fixtures/fictional-catalog-products';

describe('Gemma post-UCP — product_type + stone exact', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-GEMMA-PT-ST-1: pierścionek + granat + srebrny → tylko pierścionek z granatem', async () => {
    const base = fictionalMultiVariantProduct();
    const ring = {
      ...base,
      handle: 'pierscionek-srebrny-z-granatem',
      productType: 'Pierścionki',
      stones: ['Granat'],
      variants: [
        {
          ...base.variants[0],
          metal: 'srebro 925',
          price: moneyFromMinor(34_000),
          variantId: 'gid://shopify/ProductVariant/ring',
        },
      ],
    };
    const branch = {
      ...base,
      handle: 'galazki-z-granatem',
      productType: 'Kolczyki',
      stones: ['Granat'],
      variants: [
        {
          ...base.variants[0],
          metal: 'srebro 925',
          price: moneyFromMinor(32_000),
          variantId: 'gid://shopify/ProductVariant/branch',
        },
      ],
    };
    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: vi.fn().mockResolvedValue({
        matches: [fictionalMatchFromProduct(branch), fictionalMatchFromProduct(ring)],
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

    const out = await searchGemmaCatalog(
      {SHOP_DOMAIN: 'x'} as never,
      'epir-online-store',
      {
        text: 'pierścionek srebrny granat',
        metal: ['srebrny'],
        stone: ['granat'],
        productType: ['pierścionek'],
        priceMax: moneyFromMinor(34_000),
      },
      10,
    );
    expect(out).toHaveLength(1);
    expect(out[0].product.handle).toBe('pierscionek-srebrny-z-granatem');
  });

  it('T-GEMMA-ASSAY-1: slot 585 → jeden wariant złoto 585 (flat), nie widełki prób', async () => {
    const base = fictionalMultiVariantProduct();
    const product = {
      ...base,
      variants: [
        {...base.variants[0], metal: 'złoto 333', price: moneyFromMinor(200_000), variantId: 'v333'},
        {...base.variants[1], metal: 'złoto 585', price: moneyFromMinor(339_000), variantId: 'v585a'},
        {...base.variants[2], metal: 'złoto 585', price: moneyFromMinor(350_000), variantId: 'v585b'},
      ],
    };
    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: vi.fn().mockResolvedValue({
        matches: [fictionalMatchFromProduct(product)],
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

    const out = await searchGemmaCatalog(
      {SHOP_DOMAIN: 'x'} as never,
      'epir-online-store',
      {metal: ['585'], priceMax: moneyFromMinor(400_000)},
      10,
    );
    expect(out).toHaveLength(1);
    expect(out[0].matchingVariants).toHaveLength(1);
    expect(out[0].matchingVariants[0].metal).toBe('złoto 585');
    expect(out[0].matchingVariants[0].variantId).toBe('v585a');
    expect(out[0].isFlat).toBe(true);
  });
});
