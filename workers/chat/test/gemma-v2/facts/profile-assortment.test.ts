/**
 * E2b — asortyment GZ po tagu Shopify `zareczyny`.
 *
 * Mutacje:
 * - **M-E2b-6** — W `assortment.ts` na błąd zwróć wszystkie produkty zamiast [] → T-E2b-GZ-2 FAIL.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  ZARECZYNY_ASSORTMENT_TAG,
  filterProductMatchesByZareczynyTag,
} from '../../../src/gemma/facts/assortment';
import * as graphql from '../../../src/graphql';
import {fictionalMatchFromProduct, fictionalMultiVariantProduct} from '../fixtures/fictional-catalog-products';

function envWithGzToken(): import('../../../src/config/bindings').Env {
  return {
    SHOP_DOMAIN: 'fikcyjny-sklep.myshopify.com',
    PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY: 'fikcyjny-gz-token',
  } as import('../../../src/config/bindings').Env;
}

describe('E2b GZ assortment by tag', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-E2b-GZ-1: keeps only products whose Storefront tags include zareczyny', async () => {
    const pIn = fictionalMultiVariantProduct();
    pIn.productId = 'gid://shopify/Product/910001';
    const pOut = fictionalMultiVariantProduct();
    pOut.productId = 'gid://shopify/Product/910002';
    const matches = [
      fictionalMatchFromProduct(pIn),
      fictionalMatchFromProduct(pOut),
    ];
    vi.spyOn(graphql, 'callStorefrontAPI').mockResolvedValue({
      nodes: [
        {id: pIn.productId, tags: [ZARECZYNY_ASSORTMENT_TAG, 'fikcyjne']},
        {id: pOut.productId, tags: ['inne']},
      ],
    });

    const out = await filterProductMatchesByZareczynyTag(
      envWithGzToken(),
      'epir-zareczyny',
      matches,
    );
    expect(out).toHaveLength(1);
    expect(out[0].product.productId).toBe(pIn.productId);
  });

  it('T-E2b-GZ-2: GraphQL ACCESS_DENIED → zero products', async () => {
    const matches = [fictionalMatchFromProduct(fictionalMultiVariantProduct())];
    vi.spyOn(graphql, 'callStorefrontAPI').mockRejectedValue(
      new Error('GraphQL errors: ACCESS_DENIED'),
    );
    const out = await filterProductMatchesByZareczynyTag(
      envWithGzToken(),
      'epir-zareczyny',
      matches,
    );
    expect(out).toHaveLength(0);
  });

  it('T-E2b-GZ-3: epir-online-store never queries tags', async () => {
    const spy = vi.spyOn(graphql, 'callStorefrontAPI');
    const matches = [fictionalMatchFromProduct(fictionalMultiVariantProduct())];
    const out = await filterProductMatchesByZareczynyTag(
      envWithGzToken(),
      'epir-online-store',
      matches,
    );
    expect(out).toEqual(matches);
    expect(spy).not.toHaveBeenCalled();
  });

  it('T-E2b-GZ-TOKEN: missing GZ Storefront token → zero products and assortment_tags_unavailable warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const matches = [fictionalMatchFromProduct(fictionalMultiVariantProduct())];
    const env = {SHOP_DOMAIN: 'fikcyjny-sklep.myshopify.com'} as import('../../../src/config/bindings').Env;
    const out = await filterProductMatchesByZareczynyTag(env, 'epir-zareczyny', matches);
    expect(out).toHaveLength(0);
    expect(
      warnSpy.mock.calls.some((args) => {
        const raw = args[0];
        if (typeof raw !== 'string') return false;
        try {
          const parsed = JSON.parse(raw) as {tag?: string};
          return parsed.tag === 'gemma.facts.assortment_tags_unavailable';
        } catch {
          return false;
        }
      }),
    ).toBe(true);
    warnSpy.mockRestore();
  });

  it('T-E2b-GZ-5: tag match is case-insensitive (Zareczyny)', async () => {
    const pIn = fictionalMultiVariantProduct();
    pIn.productId = 'gid://shopify/Product/910003';
    const matches = [fictionalMatchFromProduct(pIn)];
    vi.spyOn(graphql, 'callStorefrontAPI').mockResolvedValue({
      nodes: [{id: pIn.productId, tags: ['Zareczyny']}],
    });
    const out = await filterProductMatchesByZareczynyTag(
      envWithGzToken(),
      'epir-zareczyny',
      matches,
    );
    expect(out).toHaveLength(1);
  });
});
