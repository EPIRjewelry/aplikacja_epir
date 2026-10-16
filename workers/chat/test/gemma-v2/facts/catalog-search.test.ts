/**
 * E2b — pipeline searchGemmaCatalog.
 *
 * Mutacje:
 * - **M-E2b-1** — Pomiń `filterProducts` z price w `catalog-search.ts` → T-E2b-PIPE-1 FAIL.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {searchGemmaCatalog} from '../../../src/gemma/facts/catalog-search';
import * as facts from '../../../src/facts';
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
    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: searchSpy,
    } as never);
    const out = await searchGemmaCatalog(
      {SHOP_DOMAIN: 'fikcyjny.myshopify.com'} as import('../../../src/config/bindings').Env,
      'epir-online-store',
      {text: 'fikcyjne', priceMax: moneyFromMinor(200_000)},
      10,
    );

    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({text: 'fikcyjne'}),
      10,
    );
    expect(searchSpy.mock.calls[0][0]).not.toHaveProperty('priceMax');
    expect(searchSpy.mock.calls[0][0]).not.toHaveProperty('priceMin');
    expect(out).toHaveLength(1);
    expect(out[0].matchingVariants.length).toBe(1);
  });

  it('T-E2b-PIPE-2: epir-zareczyny uses catalog snapshot GE and urlChannel + tag query', async () => {
    const product = fictionalMultiVariantProduct();
    const match = fictionalMatchFromProduct(product);
    const repoSpy = vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: vi.fn().mockResolvedValue({
        matches: [match],
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
    vi.spyOn(graphql, 'callStorefrontAPI').mockResolvedValue({
      nodes: [{id: product.productId, tags: [ZARECZYNY_ASSORTMENT_TAG]}],
    });

    const env = {
      SHOP_DOMAIN: 'fikcyjny.myshopify.com',
      PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY: 'tok',
    } as import('../../../src/config/bindings').Env;

    const out = await searchGemmaCatalog(env, 'epir-zareczyny', {text: 'fikcyjne'}, 10, new Request('https://example.com'));

    expect(repoSpy).toHaveBeenCalledWith(
      expect.anything(),
      'epir-online-store',
      expect.objectContaining({urlChannel: 'epir-zareczyny'}),
    );
    expect(out).toHaveLength(1);
  });
});
