import {describe, expect, it, vi, afterEach} from 'vitest';
import {fetchGkCatalogProducts} from '../src/facts/fetch-gk';
import {fetchGeCatalogProducts} from '../src/facts/fetch-ge';
import {SHOPIFY_STOREFRONT_API_VERSION} from '../src/config/shopify-api-version';
import type {Env} from '../src/config/bindings';

afterEach(() => {
  vi.restoreAllMocks();
});

type GkEnv = Env & {PRIVATE_STOREFRONT_API_TOKEN_KAZKA?: string};

describe('fetchGkCatalogProducts (private Storefront)', () => {
  it('SHOPIFY_STOREFRONT_API_VERSION is 2026-10', () => {
    expect(SHOPIFY_STOREFRONT_API_VERSION).toBe('2026-10');
  });

  it('no private token → no_token (public ignored, no fetch)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      fetchGkCatalogProducts({
        SHOP_DOMAIN: 'example.myshopify.com',
        PUBLIC_STOREFRONT_API_TOKEN_KAZKA: 'public-only',
      } as GkEnv),
    ).rejects.toThrow('no_token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses private token header, @inContext PL, API 2026-10; Buyer-IP only with CF-Connecting-IP', async () => {
    const seen: Array<{url: string; headers: Headers; body: string}> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const headers = new Headers(init?.headers);
      seen.push({
        url: String(input),
        headers,
        body: typeof init?.body === 'string' ? init.body : '',
      });
      return new Response(
        JSON.stringify({
          data: {
            products: {
              pageInfo: {hasNextPage: false, endCursor: null},
              nodes: [
                {
                  id: 'gid://shopify/Product/1',
                  handle: 'ring',
                  title: 'Ring',
                  collections: {
                    pageInfo: {hasNextPage: false, endCursor: null},
                    nodes: [{handle: 'all', title: 'All'}],
                  },
                  variants: {
                    pageInfo: {hasNextPage: false, endCursor: null},
                    nodes: [
                      {
                        id: 'gid://shopify/ProductVariant/1',
                        price: {amount: '10.00', currencyCode: 'PLN'},
                        availableForSale: true,
                        selectedOptions: [],
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

    const cronProducts = await fetchGkCatalogProducts({
      SHOP_DOMAIN: 'example.myshopify.com',
      PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv-token',
      PUBLIC_STOREFRONT_API_TOKEN_KAZKA: 'must-not-be-used',
    } as GkEnv);
    expect(cronProducts).toHaveLength(1);
    expect(seen[0].url).toContain('/api/2026-10/graphql.json');
    expect(seen[0].headers.get('Shopify-Storefront-Private-Token')).toBe('priv-token');
    expect(seen[0].headers.get('X-Shopify-Storefront-Access-Token')).toBeNull();
    expect(seen[0].headers.get('Shopify-Storefront-Buyer-IP')).toBeNull();
    expect(seen[0].body).toContain('@inContext(country: PL, language: PL)');

    seen.length = 0;
    const req = new Request('https://example.com/chat', {
      headers: {'CF-Connecting-IP': '203.0.113.9'},
    });
    await fetchGkCatalogProducts(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv-token',
      } as GkEnv,
      {clientRequest: req},
    );
    expect(seen[0].headers.get('Shopify-Storefront-Buyer-IP')).toBe('203.0.113.9');
  });

  it('paginates collections to the end into one product', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      if (body.includes('ProductCollectionsGk')) {
        const vars = JSON.parse(body).variables as {cursor?: string | null};
        if (vars.cursor === 'c1') {
          return new Response(
            JSON.stringify({
              data: {
                product: {
                  collections: {
                    pageInfo: {hasNextPage: true, endCursor: 'c2'},
                    nodes: [{handle: 'b', title: 'B'}],
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
                collections: {
                  pageInfo: {hasNextPage: false, endCursor: null},
                  nodes: [{handle: 'c', title: 'C'}],
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
                  id: 'gid://shopify/Product/7',
                  handle: 'multi-col',
                  title: 'Multi Col',
                  collections: {
                    pageInfo: {hasNextPage: true, endCursor: 'c1'},
                    nodes: [{handle: 'a', title: 'A'}],
                  },
                  variants: {
                    pageInfo: {hasNextPage: false, endCursor: null},
                    nodes: [
                      {
                        id: 'gid://shopify/ProductVariant/7',
                        price: {amount: '1.00', currencyCode: 'PLN'},
                        availableForSale: true,
                        selectedOptions: [],
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

    const products = await fetchGkCatalogProducts({
      SHOP_DOMAIN: 'example.myshopify.com',
      PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv',
    } as GkEnv);
    expect(products).toHaveLength(1);
    expect(products[0].collections.map((c) => c.handle)).toEqual(['a', 'b', 'c']);
  });
});

describe('fetchGeCatalogProducts collections pagination (paged fallback)', () => {
  it('merges collection pages on paged path', async () => {
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
      if (body.includes('ProductCollectionsGe')) {
        const vars = JSON.parse(body).variables as {cursor?: string | null};
        if (vars.cursor === 'gc1') {
          return new Response(
            JSON.stringify({
              data: {
                product: {
                  collections: {
                    pageInfo: {hasNextPage: false, endCursor: null},
                    nodes: [{handle: 'ge-b', title: 'GE B'}],
                  },
                },
              },
              extensions: {cost: {requestedQueryCost: 40}},
            }),
            {status: 200},
          );
        }
      }
      return new Response(
        JSON.stringify({
          data: {
            products: {
              pageInfo: {hasNextPage: false, endCursor: null},
              nodes: [
                {
                  id: 'gid://shopify/Product/21',
                  handle: 'ge-cols',
                  title: 'GE Cols',
                  onlineStoreUrl: 'https://epirbizuteria.pl/products/ge-cols',
                  collections: {
                    pageInfo: {hasNextPage: true, endCursor: 'gc1'},
                    nodes: [{handle: 'ge-a', title: 'GE A'}],
                  },
                  variants: {
                    pageInfo: {hasNextPage: false, endCursor: null},
                    nodes: [
                      {
                        id: 'gid://shopify/ProductVariant/21',
                        price: '10.00',
                        availableForSale: true,
                        selectedOptions: [],
                      },
                    ],
                  },
                },
              ],
            },
          },
          extensions: {cost: {requestedQueryCost: 80}},
        }),
        {status: 200},
      );
    });

    const products = await fetchGeCatalogProducts({
      SHOP_DOMAIN: 'example.myshopify.com',
      SHOPIFY_ADMIN_TOKEN: 'admin',
    } as Env);
    expect(products).toHaveLength(1);
    expect(products[0].collections.map((c) => c.handle)).toEqual(['ge-a', 'ge-b']);
  });
});
