import {describe, expect, it, vi, afterEach} from 'vitest';
import {fetchProductFactsLive} from '../src/facts/storefront-live';
import {SHOPIFY_STOREFRONT_API_VERSION} from '../src/config/shopify-api-version';
import type {Env} from '../src/config/bindings';

afterEach(() => {
  vi.restoreAllMocks();
});

function mkVariantNode(
  id: string,
  price: string,
  metafields?: Array<{namespace: string; key: string; value: string} | null>,
) {
  return {
    id,
    price: {amount: price, currencyCode: 'PLN'},
    availableForSale: true,
    selectedOptions: [],
    // Storefront 2026-10: metafields(identifiers:) → [Metafield]!
    metafields: metafields ?? [],
  };
}

function nodesResponse(nodes: Array<Record<string, unknown> | null>) {
  return new Response(JSON.stringify({data: {nodes}}), {status: 200});
}

describe('fetchProductFactsLive', () => {
  it('SHOPIFY_STOREFRONT_API_VERSION is 2026-10', () => {
    expect(SHOPIFY_STOREFRONT_API_VERSION).toBe('2026-10');
  });

  it('no private token → no_token (public ignored, no fetch)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      fetchProductFactsLive(
        {
          SHOP_DOMAIN: 'example.myshopify.com',
          PUBLIC_STOREFRONT_API_TOKEN_KAZKA: 'public-only',
        } as Env,
        'kazka-hydrogen',
        ['gid://shopify/Product/1'],
      ),
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
      return nodesResponse([
        {
          id: 'gid://shopify/Product/1',
          handle: 'ring',
          title: 'Ring',
          productType: 'Ring',
          collections: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: []},
          variants: {
            pageInfo: {hasNextPage: false, endCursor: null},
            nodes: [mkVariantNode('gid://shopify/ProductVariant/1', '10.00')],
          },
          metafields: [],
        },
      ]);
    });

    const products = await fetchProductFactsLive(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv-token',
        PUBLIC_STOREFRONT_API_TOKEN_KAZKA: 'must-not-be-used',
      } as Env,
      'kazka-hydrogen',
      ['gid://shopify/Product/1'],
    );
    expect(products).toHaveLength(1);
    expect(seen[0].url).toContain('/api/2026-10/graphql.json');
    expect(seen[0].headers.get('Shopify-Storefront-Private-Token')).toBe('priv-token');
    expect(seen[0].headers.get('X-Shopify-Storefront-Access-Token')).toBeNull();
    expect(seen[0].headers.get('Shopify-Storefront-Buyer-IP')).toBeNull();
    expect(seen[0].body).toContain('@inContext(country: PL, language: PL)');

    seen.length = 0;
    const req = new Request('https://example.com/chat', {
      headers: {'CF-Connecting-IP': '203.0.113.9'},
    });
    await fetchProductFactsLive(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv-token',
      } as Env,
      'kazka-hydrogen',
      ['gid://shopify/Product/1'],
      {clientRequest: req},
    );
    expect(seen[0].headers.get('Shopify-Storefront-Buyer-IP')).toBe('203.0.113.9');
  });

  it('paginates collections to the end into one product', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      if (body.includes('ProductCollectionsLive')) {
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
      return nodesResponse([
        {
          id: 'gid://shopify/Product/7',
          handle: 'multi-col',
          title: 'Multi Col',
          productType: 'Ring',
          collections: {
            pageInfo: {hasNextPage: true, endCursor: 'c1'},
            nodes: [{handle: 'a', title: 'A'}],
          },
          variants: {
            pageInfo: {hasNextPage: false, endCursor: null},
            nodes: [mkVariantNode('gid://shopify/ProductVariant/7', '1.00')],
          },
          metafields: [],
        },
      ]);
    });

    const products = await fetchProductFactsLive(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv',
      } as Env,
      'kazka-hydrogen',
      ['gid://shopify/Product/7'],
    );
    expect(products).toHaveLength(1);
    expect(products[0].collections.map((c) => c.handle)).toEqual(['a', 'b', 'c']);
  });

  it('skips null node from nodes(ids)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      nodesResponse([
        null,
        {
          id: 'gid://shopify/Product/2',
          handle: 'ok',
          title: 'Ok',
          productType: 'Ring',
          collections: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: []},
          variants: {
            pageInfo: {hasNextPage: false, endCursor: null},
            nodes: [mkVariantNode('gid://shopify/ProductVariant/2', '2.00')],
          },
          metafields: [],
        },
      ]),
    );
    const products = await fetchProductFactsLive(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv',
      } as Env,
      'kazka-hydrogen',
      ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
    );
    expect(products).toHaveLength(1);
    expect(products[0].handle).toBe('ok');
  });

  it('skips epir-online-store product without onlineStoreUrl', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      nodesResponse([
        {
          id: 'gid://shopify/Product/3',
          handle: 'hidden',
          title: 'Hidden',
          productType: 'Ring',
          onlineStoreUrl: null,
          collections: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: []},
          variants: {
            pageInfo: {hasNextPage: false, endCursor: null},
            nodes: [mkVariantNode('gid://shopify/ProductVariant/3', '3.00')],
          },
          metafields: [],
        },
      ]),
    );
    const products = await fetchProductFactsLive(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        SHOPIFY_STOREFRONT_TOKEN: 'public-epir',
      } as Env,
      'epir-online-store',
      ['gid://shopify/Product/3'],
    );
    expect(products).toHaveLength(0);
  });

  it('epir-online-store with SHOPIFY_STOREFRONT_TOKEN uses public header, no Buyer-IP', async () => {
    const seen: Array<Headers> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      seen.push(new Headers(init?.headers));
      return nodesResponse([
        {
          id: 'gid://shopify/Product/4',
          handle: 'pub',
          title: 'Pub',
          productType: 'Ring',
          onlineStoreUrl: 'https://epirbizuteria.pl/products/pub',
          collections: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: []},
          variants: {
            pageInfo: {hasNextPage: false, endCursor: null},
            nodes: [mkVariantNode('gid://shopify/ProductVariant/4', '4.00')],
          },
          metafields: [],
        },
      ]);
    });
    await fetchProductFactsLive(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        SHOPIFY_STOREFRONT_TOKEN: 'storefront-public',
      } as Env,
      'epir-online-store',
      ['gid://shopify/Product/4'],
      {clientRequest: new Request('https://x', {headers: {'CF-Connecting-IP': '1.2.3.4'}})},
    );
    expect(seen[0].get('X-Shopify-Storefront-Access-Token')).toBe('storefront-public');
    expect(seen[0].get('Shopify-Storefront-Private-Token')).toBeNull();
    expect(seen[0].get('Shopify-Storefront-Buyer-IP')).toBeNull();
  });

  it('reads product metafields array: main_stone, metal, gemstone_origin → facts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      nodesResponse([
        {
          id: 'gid://shopify/Product/10',
          handle: 'facts-mf',
          title: 'Facts',
          productType: 'Ring',
          collections: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: []},
          metafields: [
            {namespace: 'custom', key: 'main_stone', value: 'Szafir'},
            null,
            {namespace: 'custom', key: 'metal', value: 'Złoto 585'},
            {namespace: 'custom', key: 'gemstone_origin', value: 'naturalny'},
          ],
          variants: {
            pageInfo: {hasNextPage: false, endCursor: null},
            nodes: [
              mkVariantNode('gid://shopify/ProductVariant/10', '10.00', [
                {namespace: 'custom', key: 'gemstone_carat_weight', value: '0.42'},
                null,
                {namespace: 'custom', key: 'gemstone_type', value: 'szafir'},
              ]),
            ],
          },
        },
      ]),
    );
    const products = await fetchProductFactsLive(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv',
      } as Env,
      'kazka-hydrogen',
      ['gid://shopify/Product/10'],
    );
    expect(products[0].metafields['custom.main_stone']).toBe('Szafir');
    expect(products[0].metafields['custom.metal']).toBe('Złoto 585');
    expect(products[0].metafields['custom.gemstone_origin']).toBe('naturalny');
    expect(products[0].stones).toContain('Szafir');
    expect(products[0].metals).toContain('Złoto 585');
    expect(products[0].variants[0].variantMetafields?.['custom.gemstone_carat_weight']).toBe('0.42');
    expect(products[0].variants[0].variantMetafields?.['custom.gemstone_type']).toBe('szafir');
  });

  it('variant metafield origin overrides product metafield origin', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      nodesResponse([
        {
          id: 'gid://shopify/Product/5',
          handle: 'origin',
          title: 'Origin',
          productType: 'Ring',
          collections: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: []},
          metafields: [{namespace: 'custom', key: 'gemstone_origin', value: 'naturalny'}],
          variants: {
            pageInfo: {hasNextPage: false, endCursor: null},
            nodes: [
              mkVariantNode('gid://shopify/ProductVariant/5', '5.00', [
                {namespace: 'custom', key: 'gemstone_origin', value: 'laboratoryjny'},
              ]),
            ],
          },
        },
      ]),
    );
    const products = await fetchProductFactsLive(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv',
      } as Env,
      'kazka-hydrogen',
      ['gid://shopify/Product/5'],
    );
    expect(products[0].variants[0].stoneOrigin).toBe('lab_grown');
    expect(products[0].metafields['custom.gemstone_origin']).toBe('naturalny');
  });

  it('metaobject reference yields descriptive text, not GID', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      nodesResponse([
        {
          id: 'gid://shopify/Product/6',
          handle: 'meta',
          title: 'Meta',
          productType: 'Ring',
          collections: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: []},
          metafields: [],
          gemstoneTypeMeta: {
            references: {
              nodes: [
                {
                  type: 'gemstone_type',
                  fields: [
                    {key: 'name', value: 'Szafir'},
                    {key: 'gid', value: 'gid://shopify/Metaobject/999'},
                  ],
                },
              ],
            },
          },
          variants: {
            pageInfo: {hasNextPage: false, endCursor: null},
            nodes: [mkVariantNode('gid://shopify/ProductVariant/6', '6.00')],
          },
        },
      ]),
    );
    const products = await fetchProductFactsLive(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv',
      } as Env,
      'kazka-hydrogen',
      ['gid://shopify/Product/6'],
    );
    const val = products[0].metafields['shopify.gemstone-type'];
    expect(String(val)).toContain('Szafir');
    expect(String(val)).not.toContain('gid://');
  });

  it('stone_education includes all text fields, no GID', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      nodesResponse([
        {
          id: 'gid://shopify/Product/11',
          handle: 'edu',
          title: 'Edu',
          productType: 'Ring',
          collections: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: []},
          metafields: [],
          stoneEducationMeta: {
            reference: {
              type: 'stone_profile',
              fields: [
                {key: 'name', value: 'Szafir Cejlon'},
                {key: 'description', value: 'Korund naturalny'},
                {key: 'ref', value: 'gid://shopify/Metaobject/1'},
              ],
            },
          },
          variants: {
            pageInfo: {hasNextPage: false, endCursor: null},
            nodes: [mkVariantNode('gid://shopify/ProductVariant/11', '11.00')],
          },
        },
      ]),
    );
    const products = await fetchProductFactsLive(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv',
      } as Env,
      'kazka-hydrogen',
      ['gid://shopify/Product/11'],
    );
    const edu = String(products[0].metafields['custom.stone_education']);
    expect(edu).toContain('name');
    expect(edu).toContain('Szafir Cejlon');
    expect(edu).toContain('description');
    expect(edu).toContain('Korund naturalny');
    expect(edu).not.toContain('gid://');
  });

  it('empty metafield value is not stored as fact', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      nodesResponse([
        {
          id: 'gid://shopify/Product/8',
          handle: 'empty-mf',
          title: 'Empty',
          productType: 'Ring',
          collections: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: []},
          metafields: [{namespace: 'custom', key: 'main_stone', value: ''}, null],
          variants: {
            pageInfo: {hasNextPage: false, endCursor: null},
            nodes: [mkVariantNode('gid://shopify/ProductVariant/8', '8.00')],
          },
        },
      ]),
    );
    const products = await fetchProductFactsLive(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv',
      } as Env,
      'kazka-hydrogen',
      ['gid://shopify/Product/8'],
    );
    expect(products[0].metafields['custom.main_stone']).toBeUndefined();
    expect(products[0].stones).toHaveLength(0);
  });
});
