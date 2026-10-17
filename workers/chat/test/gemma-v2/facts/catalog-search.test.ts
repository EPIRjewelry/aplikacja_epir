/**
 * E2b — pipeline searchGemmaCatalog.
 *
 * Mutacje:
 * - **M-E2b-1** — Pomiń `filterProducts` z price w `catalog-search.ts` → T-E2b-PIPE-1 FAIL.
 * - **M-E2b-4** — Wyłącz `filterProductMatchesByZareczynyTag` w `catalog-search.ts` → T-E2b-PIPE-4 FAIL.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {searchGemmaCatalog} from '../../../src/gemma/facts/catalog-search';
import * as liveSearch from '../../../src/gemma/facts/catalog-live-search';
import * as graphql from '../../../src/graphql';
import {moneyFromMinor} from '../../../src/facts/types';
import {
  fictionalMatchFromProduct,
  fictionalMultiVariantProduct,
} from '../fixtures/fictional-catalog-products';
import {ZARECZYNY_ASSORTMENT_TAG} from '../../../src/gemma/facts/assortment';

describe('E2b catalog search pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-E2b-PIPE-1: price filter after repository search (not in repo.search args)', async () => {
    const product = fictionalMultiVariantProduct();
    const fullMatch = fictionalMatchFromProduct(product);
    const searchSpy = vi.fn().mockResolvedValue({
      matches: [fullMatch],
      total: 1,
      facets: {
        total: 1,
        byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
        byStone: {},
        byMetal: {},
        byProductType: {},
      },
    });
    vi.spyOn(liveSearch, 'gemmaCatalogLiveSearch').mockImplementation(searchSpy);
    const out = await searchGemmaCatalog(
      {SHOP_DOMAIN: 'fikcyjny.myshopify.com'} as import('../../../src/config/bindings').Env,
      'epir-online-store',
      {text: 'fikcyjne', priceMax: moneyFromMinor(200_000)},
      10,
    );

    expect(searchSpy).toHaveBeenCalledWith(
      expect.anything(),
      'epir-online-store',
      expect.objectContaining({text: 'fikcyjne'}),
      10,
      expect.anything(),
    );
    expect(searchSpy.mock.calls[0][2]).not.toHaveProperty('priceMax');
    expect(searchSpy.mock.calls[0][2]).not.toHaveProperty('priceMin');
    expect(out).toHaveLength(1);
    expect(out[0].matchingVariants.length).toBe(1);
  });

  it('T-E2b-PIPE-2: epir-zareczyny uses catalog snapshot GE and urlChannel + tag query', async () => {
    const product = fictionalMultiVariantProduct();
    const match = fictionalMatchFromProduct(product);
    const liveSpy = vi.spyOn(liveSearch, 'gemmaCatalogLiveSearch').mockResolvedValue({
      matches: [match],
      total: 1,
      facets: {
        total: 1,
        byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
        byStone: {},
        byMetal: {},
        byProductType: {},
      },
    });
    vi.spyOn(graphql, 'callStorefrontAPI').mockResolvedValue({
      nodes: [{id: product.productId, tags: [ZARECZYNY_ASSORTMENT_TAG]}],
    });

    const env = {
      SHOP_DOMAIN: 'fikcyjny.myshopify.com',
      PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY: 'tok',
    } as import('../../../src/config/bindings').Env;

    const out = await searchGemmaCatalog(env, 'epir-zareczyny', {text: 'fikcyjne'}, 10, new Request('https://example.com'));

    expect(liveSpy).toHaveBeenCalledWith(
      expect.anything(),
      'epir-online-store',
      expect.objectContaining({text: 'fikcyjne'}),
      10,
      expect.objectContaining({urlChannel: 'epir-zareczyny'}),
    );
    expect(out).toHaveLength(1);
  });

  it('T-E2b-PIPE-3: metal goes to repo.search and survives the budget filter', async () => {
    const base = fictionalMultiVariantProduct();
    const product = {
      ...base,
      variants: base.variants.map((v, i) =>
        i === 1 ? {...v, metal: 'srebro 925', price: moneyFromMinor(100_000)} : {...v, metal: 'złoto 585'},
      ),
    };
    const repoMatch = fictionalMatchFromProduct(product, {metal: ['złoto']});
    const searchSpy = vi.fn().mockResolvedValue({
      matches: [repoMatch],
      total: 1,
      facets: {
        total: 1,
        byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
        byStone: {},
        byMetal: {},
        byProductType: {},
      },
    });
    vi.spyOn(liveSearch, 'gemmaCatalogLiveSearch').mockImplementation(searchSpy);

    const out = await searchGemmaCatalog(
      {SHOP_DOMAIN: 'fikcyjny.myshopify.com'} as import('../../../src/config/bindings').Env,
      'epir-online-store',
      {text: 'fikcyjne', metal: ['złoto'], priceMax: moneyFromMinor(300_000)},
      10,
    );

    expect(searchSpy.mock.calls[0][2]).toEqual(expect.objectContaining({metal: ['złoto']}));
    expect(out).toHaveLength(1);
    expect(out[0].matchingVariants.map((v) => v.variantId)).toEqual([
      'gid://shopify/ProductVariant/900001-c',
    ]);
  });

  it('T-E2b-PIPE-4: epir-zareczyny pipeline drops products without the zareczyny tag', async () => {
    const pIn = {...fictionalMultiVariantProduct(), productId: 'gid://shopify/Product/910011'};
    const pOut = {...fictionalMultiVariantProduct(), productId: 'gid://shopify/Product/910012'};
    vi.spyOn(liveSearch, 'gemmaCatalogLiveSearch').mockResolvedValue({
      matches: [fictionalMatchFromProduct(pIn), fictionalMatchFromProduct(pOut)],
      total: 2,
      facets: {
        total: 2,
        byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
        byStone: {},
        byMetal: {},
        byProductType: {},
      },
    });
    vi.spyOn(graphql, 'callStorefrontAPI').mockResolvedValue({
      nodes: [
        {id: pIn.productId, tags: [ZARECZYNY_ASSORTMENT_TAG]},
        {id: pOut.productId, tags: ['inne']},
      ],
    });
    const env = {
      SHOP_DOMAIN: 'fikcyjny.myshopify.com',
      PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY: 'fikcyjny-gz-token',
    } as import('../../../src/config/bindings').Env;

    const out = await searchGemmaCatalog(env, 'epir-zareczyny', {text: 'fikcyjne'}, 10);

    expect(out.map((m) => m.product.productId)).toEqual([pIn.productId]);
  });

  it('T-E2b-GE-GZ-2: GE vs GZ same metal/budget filters yield identical matchingVariants before tag drop', async () => {
    const product = fictionalMultiVariantProduct();
    const match = fictionalMatchFromProduct(product, {
      metal: ['złoto 585'],
      priceMax: moneyFromMinor(300_000),
    });
    const searchSpy = vi.fn().mockResolvedValue({
      matches: [match],
      total: 1,
      facets: {
        total: 1,
        byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
        byStone: {},
        byMetal: {},
        byProductType: {},
      },
    });
    vi.spyOn(liveSearch, 'gemmaCatalogLiveSearch').mockImplementation(searchSpy);
    vi.spyOn(graphql, 'callStorefrontAPI').mockResolvedValue({
      nodes: [{id: product.productId, tags: [ZARECZYNY_ASSORTMENT_TAG]}],
    });
    const baseEnv = {SHOP_DOMAIN: 'fikcyjny.myshopify.com'} as import('../../../src/config/bindings').Env;
    const gzEnv = {
      ...baseEnv,
      PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY: 'fikcyjny-gz-token',
    } as import('../../../src/config/bindings').Env;
    const filters = {text: 'fikcyjne', metal: ['złoto 585'], priceMax: moneyFromMinor(300_000)};

    const geOut = await searchGemmaCatalog(baseEnv, 'epir-online-store', filters, 10);
    const gzOut = await searchGemmaCatalog(gzEnv, 'epir-zareczyny', filters, 10);

    expect(geOut[0]?.matchingVariants).toEqual(gzOut[0]?.matchingVariants);
    expect(searchSpy).toHaveBeenCalledTimes(2);
  });
});
