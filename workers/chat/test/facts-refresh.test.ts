import {describe, expect, it, vi, afterEach} from 'vitest';
import {
  AdminGraphqlCostError,
  AdminGraphqlThrottledError,
  parseBulkProductsJsonl,
} from '../src/facts/fetch-ge';
import {refreshGeSnapshot, refreshGkSnapshot, refreshAllCatalogSnapshots} from '../src/facts/refresh';
import type {Env} from '../src/config/bindings';

function makeKv() {
  const store = new Map<string, string>();
  return {
    store,
    kv: {
      async get(key: string, type?: string) {
        const v = store.get(key);
        if (v == null) return null;
        if (type === 'json') return JSON.parse(v);
        return v;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
    } as unknown as KVNamespace,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('catalog snapshot refresh', () => {
  it('parses bulk JSONL products + parent variants', () => {
    const jsonl = [
      JSON.stringify({
        id: 'gid://shopify/Product/1',
        handle: 'a',
        title: 'A',
        onlineStoreUrl: 'https://epirbizuteria.pl/products/a',
      }),
      JSON.stringify({
        id: 'gid://shopify/ProductVariant/1',
        __parentId: 'gid://shopify/Product/1',
        price: '10.00',
        availableForSale: true,
        selectedOptions: [],
      }),
    ].join('\n');
    const nodes = parseBulkProductsJsonl(jsonl);
    expect(nodes).toHaveLength(1);
    expect((nodes[0].variants as {nodes: unknown[]}).nodes).toHaveLength(1);
  });

  it('GE paged fallback writes only onlineStoreUrl products', async () => {
    const {kv, store} = makeKv();
    // Force bulk failure → paged path
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      if (body.includes('bulkOperationRunQuery')) {
        return new Response(
          JSON.stringify({
            data: {
              bulkOperationRunQuery: {
                bulkOperation: null,
                userErrors: [{message: 'forced'}],
              },
            },
          }),
          {status: 200},
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            products: {
              pageInfo: {hasNextPage: false, endCursor: null},
              nodes: [
                {
                  id: 'gid://shopify/Product/1',
                  handle: 'published',
                  title: 'Published',
                  onlineStoreUrl: 'https://epirbizuteria.pl/products/published',
                  variants: {
                    nodes: [
                      {
                        id: 'gid://shopify/ProductVariant/1',
                        price: '199.00',
                        availableForSale: true,
                        selectedOptions: [],
                      },
                    ],
                  },
                },
                {
                  id: 'gid://shopify/Product/2',
                  handle: 'draft-only',
                  onlineStoreUrl: null,
                  variants: {nodes: []},
                },
              ],
            },
          },
          extensions: {cost: {requestedQueryCost: 100}},
        }),
        {status: 200},
      );
    });

    const result = await refreshGeSnapshot({
      GEMMA_RUNTIME_KV: kv,
      SHOP_DOMAIN: 'example.myshopify.com',
      SHOPIFY_ADMIN_TOKEN: 'admin-token',
    } as Env);

    expect(result.ok).toBe(true);
    expect(result.productCount).toBe(1);
    const snap = JSON.parse(store.get('catalog:v1:epir-online-store')!);
    expect(snap.products[0].handle).toBe('published');
  });

  it('exposes THROTTLED and cost error classes', () => {
    expect(new AdminGraphqlThrottledError('x')).toBeInstanceOf(Error);
    expect(new AdminGraphqlCostError('y')).toBeInstanceOf(Error);
  });

  it('GK: no KAZKA token → no_token, no fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const {kv} = makeKv();
    const result = await refreshGkSnapshot({
      GEMMA_RUNTIME_KV: kv,
      SHOP_DOMAIN: 'example.myshopify.com',
      SHOPIFY_ADMIN_TOKEN: 'admin-token',
    } as Env);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GK: Storefront URL from storefronts template', async () => {
    const {kv, store} = makeKv();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      expect(String(input)).not.toContain('/admin/');
      return new Response(
        JSON.stringify({
          data: {
            products: {
              pageInfo: {hasNextPage: false, endCursor: null},
              nodes: [
                {
                  id: 'gid://shopify/Product/9',
                  handle: 'kazka-ring',
                  title: 'Kazka Ring',
                  variants: {
                    nodes: [
                      {
                        id: 'gid://shopify/ProductVariant/9',
                        price: {amount: '4001.14', currencyCode: 'PLN'},
                        availableForSale: true,
                        selectedOptions: [{name: 'Jakość', value: 'LAB'}],
                      },
                    ],
                  },
                },
              ],
            },
          },
        }),
        {status: 200},
      );
    });

    const result = await refreshGkSnapshot({
      GEMMA_RUNTIME_KV: kv,
      SHOP_DOMAIN: 'example.myshopify.com',
      PUBLIC_STOREFRONT_API_TOKEN_KAZKA: 'kazka-token',
    } as Env);

    expect(result.ok).toBe(true);
    const snap = JSON.parse(store.get('catalog:v1:kazka-hydrogen')!);
    expect(snap.products[0].url).toBe('https://kazka.epirbizuteria.pl/products/kazka-ring');
    expect(snap.products[0].variants[0].stoneOrigin).toBe('lab_grown');
  });

  it('refreshAll runs GE then GK independently', async () => {
    const {kv} = makeKv();
    const results = await refreshAllCatalogSnapshots({
      GEMMA_RUNTIME_KV: kv,
      SHOP_DOMAIN: 'example.myshopify.com',
    } as Env);
    expect(results.map((r) => r.channel)).toEqual(['epir-online-store', 'kazka-hydrogen']);
  });
});
