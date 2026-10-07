import {describe, expect, it, vi, afterEach} from 'vitest';
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
  it('GE: pages Admin products and writes only those with onlineStoreUrl', async () => {
    const {kv, store} = makeKv();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
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
                  title: 'Draft',
                  onlineStoreUrl: null,
                  variants: {nodes: []},
                },
              ],
            },
          },
        }),
        {status: 200, headers: {'Content-Type': 'application/json'}},
      );
    });

    const result = await refreshGeSnapshot({
      GEMMA_RUNTIME_KV: kv,
      SHOP_DOMAIN: 'example.myshopify.com',
      SHOPIFY_ADMIN_TOKEN: 'admin-token',
    } as Env);

    expect(result.ok).toBe(true);
    expect(result.productCount).toBe(1);
    expect(fetchMock).toHaveBeenCalled();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/admin/api/');
    const snap = JSON.parse(store.get('catalog:v1:epir-online-store')!);
    expect(snap.products).toHaveLength(1);
    expect(snap.products[0].handle).toBe('published');
  });

  it('GK: no KAZKA token → no_token and no Admin fetch', async () => {
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

  it('GK: Storefront fetch writes kazka URL from template', async () => {
    const {kv, store} = makeKv();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      expect(url).toContain('/api/');
      expect(url).not.toContain('/admin/');
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
        {status: 200, headers: {'Content-Type': 'application/json'}},
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
    expect(snap.products[0].variants[0].origin).toBe('lab_grown');
  });

  it('refreshAll runs GE then GK independently', async () => {
    const {kv} = makeKv();
    const results = await refreshAllCatalogSnapshots({
      GEMMA_RUNTIME_KV: kv,
      SHOP_DOMAIN: 'example.myshopify.com',
    } as Env);
    expect(results).toHaveLength(2);
    expect(results[0].channel).toBe('epir-online-store');
    expect(results[0].ok).toBe(false);
    expect(results[1].channel).toBe('kazka-hydrogen');
    expect(results[1].reason).toBe('no_token');
  });
});
