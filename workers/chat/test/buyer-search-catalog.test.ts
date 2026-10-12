import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeBuyerTool } from '../src/buyer/execute-buyer-tool';
import { validateSearchCatalogArgs } from '../src/buyer/search-catalog-args';
import * as facts from '../src/facts';
import * as mcpServer from '../src/mcp_server';

describe('search_catalog buyer tool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('validateSearchCatalogArgs rejects extra fields and invalid prices', () => {
    expect(validateSearchCatalogArgs({ query: 'ab', foo: 1 }).ok).toBe(false);
    expect(validateSearchCatalogArgs({ query: 'ok', price_min_pln: 1.5 }).ok).toBe(false);
    expect(validateSearchCatalogArgs({ query: 'ok', price_min_pln: 100, price_max_pln: 50 }).ok).toBe(
      false,
    );
  });

  it('validateSearchCatalogArgs rejects limit, currency and filters from model', () => {
    const base = { query: 'pierścionek' };
    for (const key of ['limit', 'currency', 'filters'] as const) {
      const r = validateSearchCatalogArgs({ ...base, [key]: key === 'limit' ? 5 : key === 'currency' ? 'EUR' : {} });
      expect(r.ok).toBe(false);
      if (!r.ok && r.reason === 'extra_fields') {
        expect(r.droppedKeys).toContain(key);
      }
    }
  });

  it('execute search_catalog passes price_max_pln as minor units to repository search', async () => {
    const searchSpy = vi.fn().mockResolvedValue({
      matches: [],
      total: 0,
      facets: {
        total: 0,
        byOrigin: { natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0 },
        byStone: {},
        byMetal: {},
        byProductType: {},
      },
    });
    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: searchSpy,
    } as never);
    vi.spyOn(mcpServer, 'callMcpToolDirect');

    await executeBuyerTool({
      env: { SHOP_DOMAIN: 'shop.myshopify.com', PRIVATE_STOREFRONT_API_TOKEN: 'x' } as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['search_catalog'],
      name: 'search_catalog',
      argsJson: JSON.stringify({ query: 'pierścionek', price_max_pln: 5000 }),
      sessionCartId: null,
      allowedVariantIds: new Set(),
      request: new Request('https://example.com'),
    });

    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'pierścionek', priceMax: 500_000 }),
      10,
    );
  });

  it('execute search_catalog on epir-zareczyny passes urlChannel to repository', async () => {
    const repoSpy = vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: vi.fn().mockResolvedValue({
        matches: [],
        total: 0,
        facets: {
          total: 0,
          byOrigin: { natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0 },
          byStone: {},
          byMetal: {},
          byProductType: {},
        },
      }),
    } as never);
    vi.spyOn(mcpServer, 'callMcpToolDirect');

    await executeBuyerTool({
      env: {
        SHOP_DOMAIN: 'shop.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN: 'x',
      } as import('../src/config/bindings').Env,
      channelId: 'epir-zareczyny',
      readyTools: ['search_catalog'],
      name: 'search_catalog',
      argsJson: JSON.stringify({ query: 'pierścionek' }),
      sessionCartId: null,
      allowedVariantIds: new Set(),
      request: new Request('https://example.com'),
    });

    expect(repoSpy).toHaveBeenCalledWith(
      expect.anything(),
      'epir-online-store',
      expect.objectContaining({ urlChannel: 'epir-zareczyny' }),
    );
  });

  it('search_catalog on epir-zareczyny returns product url on zareczyny subdomain', async () => {
    const zareczynyProductUrl = 'https://zareczyny.epirbizuteria.pl/products/solitaire-gold';
    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: vi.fn().mockResolvedValue({
        matches: [
          {
            product: {
              channel: 'epir-zareczyny',
              productId: 'gid://shopify/Product/1',
              handle: 'solitaire-gold',
              title: 'Solitaire',
              vendor: '',
              productType: null,
              url: zareczynyProductUrl,
              image: null,
              collections: [],
              descriptionText: '',
              options: [],
              variants: [
                {
                  variantId: 'gid://shopify/ProductVariant/1',
                  title: 'default',
                  image: null,
                  sku: null,
                  weight: 3,
                  weightUnit: 'GRAMS',
                  price: { minor: 10000, currency: 'PLN', display_pl: '100 zł'},
                  compareAtPrice: null,
                  available: true,
                  selectedOptions: [],
                  metal: 'złoto',
                  size: null,
                  stoneOrigin: 'unknown',
                  originEvidence: [],
                },
              ],
              priceRange: {
                min: { minor: 10000, currency: 'PLN', display_pl: '100 zł'},
                max: { minor: 10000, currency: 'PLN', display_pl: '100 zł'},
                isFlat: true,
              },
              stones: [],
              metals: ['złoto'],
              sizes: [],
              metafields: {},
              productOriginRaw: null,
              dataIssues: [],
              fetchedAt: new Date().toISOString(),
            },
            matchingVariants: [],
            matchingPriceRange: {
              min: { minor: 10000, currency: 'PLN', display_pl: '100 zł'},
              max: { minor: 10000, currency: 'PLN', display_pl: '100 zł'},
              isFlat: true,
            },
          },
        ],
        total: 1,
        facets: {
          total: 1,
          byOrigin: { natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0 },
          byStone: {},
          byMetal: {},
          byProductType: {},
        },
      }),
    } as never);
    vi.spyOn(mcpServer, 'callMcpToolDirect');

    const r = await executeBuyerTool({
      env: {
        SHOP_DOMAIN: 'shop.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN: 'x',
      } as import('../src/config/bindings').Env,
      channelId: 'epir-zareczyny',
      readyTools: ['search_catalog'],
      name: 'search_catalog',
      argsJson: JSON.stringify({ query: 'solitaire' }),
      sessionCartId: null,
      allowedVariantIds: new Set(['gid://shopify/ProductVariant/1']),
      request: new Request('https://example.com'),
    });

    const body = JSON.parse(r.content) as {products?: string};
    expect(body.products).toContain('zareczyny.epirbizuteria.pl/products/solitaire-gold');
  });
});
