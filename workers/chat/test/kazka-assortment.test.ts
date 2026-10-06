import {afterEach, describe, expect, it, vi} from 'vitest';
import {callMcpToolDirect} from '../src/mcp_server';
import {
  enforceEpirAssortmentOnCatalogResult,
  enforceKazkaAssortmentOnCatalogResult,
  isEpirFamilyCatalogBrand,
  isKazkaAssortment,
  resolveCatalogToolBrand,
} from '../src/catalog/kazka-assortment';

/**
 * Reguła kanoniczna: tag `kazka` LUB vendor `Kazka`
 * (scripts/separate-kazka-from-online-store.mjs, scripts/seed-kazka-featured-products.mjs).
 * SKU poniżej to stałe fixture tej reguły — test nie woła sklepu produkcyjnego.
 */
const EPIR_ONLY_SKU = 'EPIR-ORG-104-10692';
const KAZKA_SKU = 'KAZKA-LAB-104-10004';
const EPIR_VARIANT_ID = 'gid://shopify/ProductVariant/11';
const KAZKA_VARIANT_ID = 'gid://shopify/ProductVariant/22';

const SHOP = 'epir-art-silver-jewellery.myshopify.com';

function mcpCatalogResponse(products: unknown[]) {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [{type: 'text', text: JSON.stringify({products})}],
      },
    }),
    {status: 200, headers: {'Content-Type': 'application/json'}},
  );
}

function catalogProduct(title: string, variantId: string, sku: string) {
  return {
    title,
    variants: [{id: variantId, sku, title: 'Default'}],
  };
}

function productsFromTool(result: unknown): Array<Record<string, unknown>> {
  const content = (result as {content?: Array<{text?: string}>}).content;
  const parsed = JSON.parse(content?.[0]?.text ?? '{}') as {products?: Array<Record<string, unknown>>};
  return parsed.products ?? [];
}

function skusOf(products: Array<Record<string, unknown>>): string[] {
  return products.flatMap((product) => {
    const variants = product.variants;
    if (!Array.isArray(variants)) return [];
    return variants
      .map((variant) => (variant && typeof variant === 'object' ? (variant as {sku?: string}).sku : undefined))
      .filter((sku): sku is string => typeof sku === 'string');
  });
}

function adminMembershipResponse() {
  return new Response(
    JSON.stringify({
      data: {
        nodes: [
          {
            __typename: 'ProductVariant',
            id: EPIR_VARIANT_ID,
            sku: EPIR_ONLY_SKU,
            product: {
              id: 'gid://shopify/Product/1',
              handle: 'galazki',
              vendor: 'EPIR',
              tags: ['srebro', 'organika'],
              status: 'ACTIVE',
              publishedOnCurrentPublication: true,
              onlineStoreUrl: 'https://epirbizuteria.pl/products/galazki',
            },
          },
          {
            __typename: 'ProductVariant',
            id: KAZKA_VARIANT_ID,
            sku: KAZKA_SKU,
            product: {
              id: 'gid://shopify/Product/2',
              handle: 'solitaire',
              vendor: 'Kazka',
              tags: ['kazka', 'kazka-pierscionek'],
              status: 'ACTIVE',
              publishedOnCurrentPublication: true,
              onlineStoreUrl: 'https://epirbizuteria.pl/products/soliter',
            },
          },
        ],
        products: {nodes: []},
      },
    }),
    {status: 200, headers: {'Content-Type': 'application/json'}},
  );
}

describe('Kazka assortment rule', () => {
  it('keeps tag kazka or vendor Kazka and rejects EPIR-only and category-only tags', () => {
    expect(isKazkaAssortment({vendor: 'Kazka', tags: []})).toBe(true);
    expect(isKazkaAssortment({vendor: 'KAZKA', tags: ['srebro']})).toBe(true);
    expect(isKazkaAssortment({vendor: 'EPIR', tags: ['kazka']})).toBe(true);
    expect(isKazkaAssortment({vendor: 'EPIR', tags: ['Kazka']})).toBe(true);
    expect(isKazkaAssortment({vendor: 'EPIR', tags: ['srebro', 'organika']})).toBe(false);
    expect(isKazkaAssortment({vendor: 'EPIR', tags: ['kazka-pierscionek']})).toBe(false);
    expect(isKazkaAssortment({vendor: 'Kazka Jewelry', tags: []})).toBe(true);
    expect(isKazkaAssortment({vendor: 'Kazka Jewelry Studio', tags: ['srebro']})).toBe(true);
  });

  it('routes hydrogen-kazka and kazka_headless onto the Kazka catalog brand', () => {
    expect(resolveCatalogToolBrand({channel: 'hydrogen-kazka', brand: 'epir'})).toBe('kazka');
    expect(resolveCatalogToolBrand({channel: 'kazka_headless'})).toBe('kazka');
    expect(resolveCatalogToolBrand({storefrontId: 'kazka'})).toBe('kazka');
    expect(resolveCatalogToolBrand({brand: 'kazka'})).toBe('kazka');
    expect(resolveCatalogToolBrand({storefrontId: 'zareczyny', brand: 'kazka'})).toBe('zareczyny');
    expect(resolveCatalogToolBrand({channel: 'hydrogen-kazka', storefrontId: 'online-store', brand: 'epir'})).toBe(
      'kazka',
    );
    expect(resolveCatalogToolBrand({storefrontId: 'online-store', channel: 'online-store', brand: 'epir'})).toBe(
      'epir',
    );
    expect(isEpirFamilyCatalogBrand('epir')).toBe(true);
    expect(isEpirFamilyCatalogBrand('zareczyny')).toBe(true);
    expect(isEpirFamilyCatalogBrand('kazka')).toBe(false);
  });
});

describe('enforceKazkaAssortmentOnCatalogResult', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('drops DRAFT Kazka cards and keeps ACTIVE cards without Online Store URL', async () => {
    const filtered = await enforceKazkaAssortmentOnCatalogResult(
      {
        products: [
          {
            title: 'Draft Soliter',
            vendor: 'Kazka',
            tags: ['kazka'],
            status: 'DRAFT',
            onlineStoreUrl: 'https://epirbizuteria.pl/products/draft-soliter',
            variants: [{sku: 'KAZKA-DRAFT'}],
          },
          {
            title: 'Hydrogen Soliter',
            vendor: 'Kazka',
            tags: ['kazka'],
            status: 'ACTIVE',
            publishedOnCurrentPublication: false,
            variants: [{sku: 'KAZKA-UNPUB'}],
          },
          {
            title: 'Live Soliter',
            vendor: 'Kazka',
            tags: ['kazka'],
            status: 'ACTIVE',
            publishedOnCurrentPublication: true,
            onlineStoreUrl: 'https://epirbizuteria.pl/products/soliter',
            variants: [{sku: KAZKA_SKU}],
          },
        ],
      },
      {SHOP_DOMAIN: SHOP},
      {maxProducts: 3},
    );
    expect(skusOf((filtered as {products: Array<Record<string, unknown>>}).products)).toEqual([
      'KAZKA-UNPUB',
      KAZKA_SKU,
    ]);
  });

  it('drops an EPIR-only SKU and keeps a Kazka SKU when vendor and tags are on the payload', async () => {
    const filtered = await enforceKazkaAssortmentOnCatalogResult(
      {
        products: [
          {
            title: 'Gałązki',
            vendor: 'EPIR',
            tags: ['srebro'],
            variants: [{sku: EPIR_ONLY_SKU}],
          },
          {
            title: 'Solitaire',
            vendor: 'EPIR',
            tags: ['kazka'],
            variants: [{sku: KAZKA_SKU}],
          },
        ],
      },
      {SHOP_DOMAIN: SHOP},
      {maxProducts: 3},
    );
    const products = (filtered as {products: Array<Record<string, unknown>>}).products;
    expect(skusOf(products)).toEqual([KAZKA_SKU]);
    expect(skusOf(products)).not.toContain(EPIR_ONLY_SKU);
  });

  it('returns at most three Kazka products after the candidate page is filtered', async () => {
    const products = [
      {title: 'EPIR', vendor: 'EPIR', tags: ['srebro'], variants: [{sku: EPIR_ONLY_SKU}]},
      ...['A', 'B', 'C', 'D'].map((title, index) => ({
        title,
        vendor: 'Kazka',
        tags: ['kazka'],
        variants: [{sku: `KAZKA-LAB-104-1000${index}`}],
      })),
    ];
    const filtered = await enforceKazkaAssortmentOnCatalogResult(
      {products},
      {SHOP_DOMAIN: SHOP},
      {maxProducts: 3},
    );
    const skus = skusOf((filtered as {products: Array<Record<string, unknown>>}).products);
    expect(skus).toEqual(['KAZKA-LAB-104-10000', 'KAZKA-LAB-104-10001', 'KAZKA-LAB-104-10002']);
    expect(skus).not.toContain(EPIR_ONLY_SKU);
  });

  it('drops a title-only EPIR card that omits vendor and tags', async () => {
    const filtered = await enforceKazkaAssortmentOnCatalogResult(
      {products: [{title: 'Pierścionek z kolekcji Gałązki'}]},
      {SHOP_DOMAIN: SHOP},
    );
    expect((filtered as {products: unknown[]}).products).toEqual([]);
    expect(JSON.stringify(filtered)).not.toContain('Gałązki');
  });

  it('drops unverified products when membership cannot be checked', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const filtered = await enforceKazkaAssortmentOnCatalogResult(
      {
        products: [
          catalogProduct('Gałązki', EPIR_VARIANT_ID, EPIR_ONLY_SKU),
          catalogProduct('Solitaire', KAZKA_VARIANT_ID, KAZKA_SKU),
        ],
      },
      {SHOP_DOMAIN: SHOP},
    );
    expect((filtered as {products: unknown[]}).products).toEqual([]);
    expect(String((filtered as {system_note?: string}).system_note)).toContain('asortymentu Kazka');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves SKU membership through Admin and hides the EPIR-only SKU', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {query?: string; variables?: {search?: string}};
        expect(body.query ?? '').toContain('vendor');
        if ((body.query ?? '').includes('KazkaAssortmentSearch')) {
          expect(body.variables?.search).toContain(`sku:${EPIR_ONLY_SKU}`);
          expect(body.variables?.search).toContain(`sku:${KAZKA_SKU}`);
        }
        return adminMembershipResponse();
      }),
    );

    const filtered = await enforceKazkaAssortmentOnCatalogResult(
      {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              products: [
                catalogProduct('Gałązki', EPIR_VARIANT_ID, EPIR_ONLY_SKU),
                catalogProduct('Solitaire', KAZKA_VARIANT_ID, KAZKA_SKU),
              ],
            }),
          },
        ],
      },
      {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'admin-token'},
      {maxProducts: 3},
    );

    expect(skusOf(productsFromTool(filtered))).toEqual([KAZKA_SKU]);
  });
});

function thinUcpProduct(title: string, handle: string, productId: string, variantId: string, sku: string) {
  return {
    id: productId,
    title,
    handle,
    url: `https://epirbizuteria.pl/products/${handle}`,
    price_range: {
      min: {amount: 312000, currency: 'PLN'},
      max: {amount: 312000, currency: 'PLN'},
    },
    variants: [
      {
        id: variantId,
        sku,
        title: 'Default',
        price: {amount: 312000, currency: 'PLN'},
      },
    ],
  };
}

function titlesOf(products: Array<Record<string, unknown>>): string[] {
  return products.map((product) => String(product.title));
}

describe('thin UCP catalog payload omits vendor and tags', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const thinPage = () => [
    thinUcpProduct('Pierścionek z kolekcji Gałązki', 'galazki', 'gid://shopify/Product/1', EPIR_VARIANT_ID, EPIR_ONLY_SKU),
    thinUcpProduct('Pierścionek Soliter', 'soliter', 'gid://shopify/Product/2', KAZKA_VARIANT_ID, KAZKA_SKU),
  ];

  it('keeps Soliter on KAZKA and drops Gałązki', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/admin/api/')) return adminMembershipResponse();
        return mcpCatalogResponse(thinPage());
      }),
    );

    const out = await callMcpToolDirect(
      {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'admin-token'} as any,
      'search_catalog',
      {catalog: {query: 'pierścionek Soliter Gałązki'}},
      {brand: 'kazka'},
    );
    const products = productsFromTool((out as {result: unknown}).result);
    const wire = JSON.stringify((out as {result: unknown}).result);
    expect(titlesOf(products)).toEqual(['Pierścionek Soliter']);
    expect(wire).not.toContain('Gałązki');
    expect(wire).not.toContain(EPIR_ONLY_SKU);
    expect(products[0]?.vendor).toBeUndefined();
    expect(products[0]?.tags).toBeUndefined();
  });

  it('keeps Gałązki on EPIR and drops Soliter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/admin/api/')) return adminMembershipResponse();
        return mcpCatalogResponse(thinPage());
      }),
    );

    const out = await callMcpToolDirect(
      {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'admin-token'} as any,
      'search_catalog',
      {catalog: {query: 'Soliter do 5000 zł'}},
      {brand: 'epir'},
    );
    const products = productsFromTool((out as {result: unknown}).result);
    const wire = JSON.stringify((out as {result: unknown}).result);
    expect(titlesOf(products)).toEqual(['Pierścionek z kolekcji Gałązki']);
    expect(wire).not.toContain('Soliter');
    expect(wire).not.toContain(KAZKA_SKU);
  });

  it('drops Soliter on EPIR when the thin card cannot be checked', async () => {
    const filtered = await enforceEpirAssortmentOnCatalogResult(
      {products: thinPage()},
      {SHOP_DOMAIN: SHOP},
    );
    const products = (filtered as {products: Array<Record<string, unknown>>}).products;
    expect(titlesOf(products)).toEqual([]);
    expect(JSON.stringify(filtered)).not.toContain('Soliter');
  });
});

describe('callMcpToolDirect Kazka catalog filter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('drops a thin EPIR card that omits vendor and tags when the shop cannot prove it', async () => {
    const fetchMock = vi.fn(async () =>
      mcpCatalogResponse([
        catalogProduct('Gałązki', EPIR_VARIANT_ID, EPIR_ONLY_SKU),
        catalogProduct('Solitaire', KAZKA_VARIANT_ID, KAZKA_SKU),
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await callMcpToolDirect(
      {SHOP_DOMAIN: SHOP, MCP_ENDPOINT: `https://${SHOP}/api/mcp`} as any,
      'search_catalog',
      {catalog: {query: 'pierścionek', pagination: {limit: 50}}},
      {brand: 'epir'},
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.params.arguments.catalog.query).toBe('pierścionek');
    expect(request.params.arguments.catalog.pagination.limit).toBe(3);
    const skus = skusOf(productsFromTool((out as {result: unknown}).result));
    expect(skus).not.toContain(KAZKA_SKU);
    expect(skus).not.toContain(EPIR_ONLY_SKU);
    expect(skus).toEqual([]);
  });

  it('never returns the EPIR-only SKU on brand=kazka and still returns the Kazka SKU', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/admin/api/')) return adminMembershipResponse();
      return mcpCatalogResponse([
        catalogProduct('Gałązki', EPIR_VARIANT_ID, EPIR_ONLY_SKU),
        catalogProduct('Solitaire', KAZKA_VARIANT_ID, KAZKA_SKU),
      ]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await callMcpToolDirect(
      {
        SHOP_DOMAIN: SHOP,
        SHOPIFY_ADMIN_TOKEN: 'admin-token',
        MCP_ENDPOINT: `https://${SHOP}/api/mcp`,
      } as any,
      'search_catalog',
      {catalog: {query: 'pierścionek'}},
      {brand: 'kazka'},
    );

    const mcpCall = fetchMock.mock.calls.find((call) => !String(call[0]).includes('/admin/api/'));
    const mcpBody = JSON.parse(String(mcpCall?.[1]?.body));
    expect(mcpBody.params.arguments.catalog.query).toBe('pierścionek');
    expect(mcpBody.params.arguments.catalog.query).not.toMatch(/tag:|vendor:/);
    expect(mcpBody.params.arguments.catalog.pagination.limit).toBe(10);
    expect(mcpBody.params.arguments.catalog.context.intent).toContain('Kazka Jewelry');

    const products = productsFromTool((out as {result: unknown}).result);
    expect(skusOf(products)).toEqual([KAZKA_SKU]);
    expect(skusOf(products)).not.toContain(EPIR_ONLY_SKU);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/admin/api/'))).toBe(true);
  });

  it('filters catalog_lookup the same way for hydrogen-kazka', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/admin/api/')) return adminMembershipResponse();
      return mcpCatalogResponse([
        catalogProduct('Gałązki', EPIR_VARIANT_ID, EPIR_ONLY_SKU),
        catalogProduct('Solitaire', KAZKA_VARIANT_ID, KAZKA_SKU),
      ]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await callMcpToolDirect(
      {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'admin-token'} as any,
      'catalog_lookup',
      {catalog: {ids: ['gid://shopify/Product/1', 'gid://shopify/Product/2']}},
      {brand: 'hydrogen-kazka'},
    );

    expect(skusOf(productsFromTool((out as {result: unknown}).result))).toEqual([KAZKA_SKU]);
  });

  it('removes an EPIR-only get_product hit', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/admin/api/')) return adminMembershipResponse();
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  product: catalogProduct('Gałązki', EPIR_VARIANT_ID, EPIR_ONLY_SKU),
                }),
              },
            ],
          },
        }),
        {status: 200, headers: {'Content-Type': 'application/json'}},
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await callMcpToolDirect(
      {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'admin-token'} as any,
      'get_product',
      {catalog: {id: EPIR_VARIANT_ID}},
      {brand: 'kazka_headless'},
    );

    const text = (out as {result: {content: Array<{text: string}>}}).result.content[0].text;
    const parsed = JSON.parse(text) as {product: unknown; system_note?: string};
    expect(parsed.product).toBeNull();
    expect(parsed.system_note).toContain('asortymentu Kazka');
    expect(text).not.toContain(EPIR_ONLY_SKU);
  });
});

describe('Storefront membership GraphQL', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not send status or publishedOnCurrentPublication to Storefront', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain('/api/2024-10/graphql.json');
      const body = JSON.parse(String(init?.body ?? '{}')) as {query?: string};
      expect(body.query ?? '').not.toMatch(/\bstatus\b/);
      expect(body.query ?? '').not.toContain('publishedOnCurrentPublication');
      return new Response(
        JSON.stringify({
          data: {
            nodes: [
              {
                __typename: 'ProductVariant',
                id: KAZKA_VARIANT_ID,
                sku: KAZKA_SKU,
                product: {
                  id: 'gid://shopify/Product/2',
                  handle: 'soliter',
                  vendor: 'Kazka',
                  tags: ['kazka'],
                },
              },
            ],
            products: {
              nodes: [
                {
                  id: 'gid://shopify/Product/2',
                  handle: 'soliter',
                  vendor: 'Kazka',
                  tags: ['kazka'],
                  variants: {nodes: [{id: KAZKA_VARIANT_ID, sku: KAZKA_SKU}]},
                },
              ],
            },
          },
        }),
        {status: 200, headers: {'Content-Type': 'application/json'}},
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const filtered = await enforceKazkaAssortmentOnCatalogResult(
      {
        products: [
          catalogProduct('Gałązki', EPIR_VARIANT_ID, EPIR_ONLY_SKU),
          catalogProduct('Solitaire', KAZKA_VARIANT_ID, KAZKA_SKU),
        ],
      },
      {SHOP_DOMAIN: SHOP, PUBLIC_STOREFRONT_API_TOKEN_KAZKA: 'kazka-sf'},
    );
    expect(skusOf((filtered as {products: Array<Record<string, unknown>>}).products)).toEqual([KAZKA_SKU]);
    expect(fetchMock).toHaveBeenCalled();
  });
});
