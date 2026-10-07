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
                    pageInfo: {hasNextPage: false, endCursor: null},
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
                  variants: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: []},
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
                    pageInfo: {hasNextPage: false, endCursor: null},
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

  it('GK and GE fallback: 3 variant pages merge into one product', async () => {
    const mkVariant = (id: number, price: string) => ({
      id: `gid://shopify/ProductVariant/${id}`,
      price: {amount: price, currencyCode: 'PLN'},
      availableForSale: true,
      selectedOptions: [],
    });
    const mkAdminVariant = (id: number, price: string) => ({
      id: `gid://shopify/ProductVariant/${id}`,
      price,
      availableForSale: true,
      selectedOptions: [],
    });

    // --- GK ---
    const {kv: kvGk, store: storeGk} = makeKv();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      if (body.includes('ProductVariantsGk')) {
        const vars = JSON.parse(body).variables as {cursor?: string | null};
        if (vars.cursor === 'v1') {
          return new Response(
            JSON.stringify({
              data: {
                product: {
                  variants: {
                    pageInfo: {hasNextPage: true, endCursor: 'v2'},
                    nodes: [mkVariant(2, '20.00')],
                  },
                },
              },
            }),
            {status: 200},
          );
        }
        return new Response(
          JSON.stringify({
            data: {
              product: {
                variants: {
                  pageInfo: {hasNextPage: false, endCursor: null},
                  nodes: [mkVariant(3, '30.00')],
                },
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
                  id: 'gid://shopify/Product/99',
                  handle: 'multi-var',
                  title: 'Multi',
                  variants: {
                    pageInfo: {hasNextPage: true, endCursor: 'v1'},
                    nodes: [mkVariant(1, '10.00')],
                  },
                },
              ],
            },
          },
        }),
        {status: 200},
      );
    });
    const gk = await refreshGkSnapshot({
      GEMMA_RUNTIME_KV: kvGk,
      SHOP_DOMAIN: 'example.myshopify.com',
      PUBLIC_STOREFRONT_API_TOKEN_KAZKA: 'kazka-token',
    } as Env);
    expect(gk.ok).toBe(true);
    const gkSnap = JSON.parse(storeGk.get('catalog:v1:kazka-hydrogen')!);
    expect(gkSnap.products).toHaveLength(1);
    expect(gkSnap.products[0].variants).toHaveLength(3);

    vi.restoreAllMocks();

    // --- GE paged fallback ---
    const {kv: kvGe, store: storeGe} = makeKv();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
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
      if (body.includes('ProductVariantsGe')) {
        const vars = JSON.parse(body).variables as {cursor?: string | null};
        if (vars.cursor === 'av1') {
          return new Response(
            JSON.stringify({
              data: {
                product: {
                  variants: {
                    pageInfo: {hasNextPage: true, endCursor: 'av2'},
                    nodes: [mkAdminVariant(12, '20.00')],
                  },
                },
              },
              extensions: {cost: {requestedQueryCost: 50}},
            }),
            {status: 200},
          );
        }
        return new Response(
          JSON.stringify({
            data: {
              product: {
                variants: {
                  pageInfo: {hasNextPage: false, endCursor: null},
                  nodes: [mkAdminVariant(13, '30.00')],
                },
              },
            },
            extensions: {cost: {requestedQueryCost: 50}},
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
                  id: 'gid://shopify/Product/11',
                  handle: 'ge-multi',
                  title: 'GE Multi',
                  onlineStoreUrl: 'https://epirbizuteria.pl/products/ge-multi',
                  variants: {
                    pageInfo: {hasNextPage: true, endCursor: 'av1'},
                    nodes: [mkAdminVariant(11, '10.00')],
                  },
                },
              ],
            },
          },
          extensions: {cost: {requestedQueryCost: 100}},
        }),
        {status: 200},
      );
    });
    const ge = await refreshGeSnapshot({
      GEMMA_RUNTIME_KV: kvGe,
      SHOP_DOMAIN: 'example.myshopify.com',
      SHOPIFY_ADMIN_TOKEN: 'admin-token',
    } as Env);
    expect(ge.ok).toBe(true);
    const geSnap = JSON.parse(storeGe.get('catalog:v1:epir-online-store')!);
    expect(geSnap.products).toHaveLength(1);
    expect(geSnap.products[0].variants).toHaveLength(3);
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
