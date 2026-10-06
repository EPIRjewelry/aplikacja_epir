import {afterEach, describe, expect, it, vi} from 'vitest';
import {callMcpToolDirect} from '../src/mcp_server';
import {fetchStoreProductsByQuery, productMatchesStone} from '../src/catalog/stone-retrieval';
import {detectStoneIntent} from '../src/catalog/stone-intent';
import {seedBuyerTurnContext} from '../src/catalog/turn-seed';
import {readPresentedProducts} from '../src/catalog/page-product-card';

const SHOP = 'epir-art-silver-jewellery.myshopify.com';

function ucpProducts(products: unknown[]) {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      content: [{type: 'text', text: JSON.stringify({products})}],
    },
  };
}

function tourmaline() {
  return {
    id: 'gid://shopify/Product/1',
    handle: 'galazki-turmalin',
    title: 'Pierścionek z czarnym turmalinem z kolekcji Gałązki',
    vendor: 'EPIR',
    tags: ['srebro'],
    url: 'https://epirbizuteria.pl/products/galazki-turmalin',
    variants: [{id: 'gid://shopify/ProductVariant/1', price: {amount: '280.00', currencyCode: 'PLN'}}],
  };
}

function sapphireNode() {
  const sizes = Array.from({length: 23}, (_, index) => String(7 + index));
  return {
    id: 'gid://shopify/Product/310',
    handle: 'obraczka-z-szafirem-epir-jewellery',
    title: 'Srebrna obrączka z szafirem syntetycznym',
    description: 'Obrączka, szafir syntetyczny, srebro.',
    vendor: 'EPIR',
    tags: ['szafir', 'srebro'],
    status: 'ACTIVE',
    publishedOnCurrentPublication: true,
    onlineStoreUrl: 'https://epir-art-silver-jewellery.myshopify.com/products/obraczka-z-szafirem-epir-jewellery',
    options: [{name: 'Rozmiar', optionValues: sizes.map((size) => ({name: size}))}],
    metafields: {nodes: [{namespace: 'custom', key: 'main_stone', value: 'szafir syntetyczny'}]},
    variants: {
      nodes: sizes.map((size, index) => ({
        id: `gid://shopify/ProductVariant/${3100 + index}`,
        title: size,
        sku: `szafir-${size}`,
        availableForSale: true,
        price: '310.00',
        selectedOptions: [{name: 'Rozmiar', value: size}],
        metafields: {nodes: [{namespace: 'custom', key: 'gemstone_type', value: 'szafir'}]},
      })),
    },
  };
}

function adminSearchResponse() {
  return new Response(
    JSON.stringify({
      data: {products: {nodes: [sapphireNode()]}},
    }),
    {status: 200, headers: {'Content-Type': 'application/json'}},
  );
}

function productsFrom(result: unknown): Array<Record<string, unknown>> {
  const text = (result as {content?: Array<{text?: string}>}).content?.[0]?.text ?? '{}';
  const parsed = JSON.parse(text) as {products?: Array<Record<string, unknown>>};
  return parsed.products ?? [];
}

describe('productMatchesStone', () => {
  it('matches title, tag and main_stone, and ignores another stone', () => {
    const intent = detectStoneIntent('szafir')!;
    expect(productMatchesStone({title: 'Obrączka z szafirem'}, intent)).toBe(true);
    expect(
      productMatchesStone(
        {title: 'Pierścionek', metafields: [{namespace: 'custom', key: 'main_stone', value: 'sapphire'}]},
        intent,
      ),
    ).toBe(true);
    expect(productMatchesStone({title: 'Pierścionek z czarnym turmalinem', tags: ['turmalin']}, intent)).toBe(false);
  });
});

describe('callMcpToolDirect stone rescue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('drops a tourmaline hit and returns the live sapphire card', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/admin/api/')) return adminSearchResponse();
      return new Response(JSON.stringify(ucpProducts([tourmaline()])), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await callMcpToolDirect(
      {
        SHOP_DOMAIN: SHOP,
        SHOPIFY_ADMIN_TOKEN: 'admin-token',
        WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl',
        MCP_ENDPOINT: `https://${SHOP}/api/ucp/mcp`,
      } as any,
      'search_catalog',
      {catalog: {query: 'biżuteria', pagination: {limit: 3}}},
      {brand: 'epir', buyerTurns: ['cos z szafirem', 'pokaz kilka']},
    );

    const mcpCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/api/ucp/mcp'));
    const mcpBody = JSON.parse(String(mcpCall?.[1]?.body));
    expect(mcpBody.params.arguments.catalog.query).toBe('(szafir OR sapphire)');
    expect(mcpBody.params.arguments.catalog.pagination.limit).toBe(12);

    const adminCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/admin/api/'));
    const adminBody = JSON.parse(String(adminCall?.[1]?.body));
    expect(String(adminBody.variables?.query ?? '')).toContain('status:active');

    const products = productsFrom((out as {result: unknown}).result);
    expect(products.map((product) => product.handle)).toEqual(['obraczka-z-szafirem-epir-jewellery']);
    expect(products[0]?.price_display_pl).toBe('310 zł');
    expect(products[0]?.price_is_flat).toBe(true);
    expect(products[0]?.sizes_label).toBe('7–29');
    expect(products[0]?.main_stone).toBe('szafir syntetyczny');
    expect(JSON.stringify(products)).not.toContain('turmalin');
    const note = JSON.parse(
      ((out as {result: {content?: Array<{text?: string}>}}).result.content?.[0]?.text ?? '{}') as string,
    ).system_note as string;
    expect(note).toContain('Trafienia kamienia');
  });

  it('does not call the shop when the buyer did not name a stone', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify(ucpProducts([tourmaline()])), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await callMcpToolDirect(
      {
        SHOP_DOMAIN: SHOP,
        SHOPIFY_ADMIN_TOKEN: 'admin-token',
        WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl',
      } as any,
      'search_catalog',
      {catalog: {query: 'rings', pagination: {limit: 50}}},
      {brand: 'epir', buyerTurns: ['ring']},
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.params.arguments.catalog.query).toBe('rings');
    expect(body.params.arguments.catalog.pagination.limit).toBe(3);
  });
});

const SAPPHIRE_FIXTURE = [
  {
    handle: 'zloty-pierscionek-z-naturalnym-szafirem',
    title: 'Złoty pierścionek z naturalnym szafirem',
    publishedOnCurrentPublication: false,
  },
  {
    handle: 'pierscionek-srebrny-fale-wody-z-szafirem',
    title: 'Pierścionek srebrny fale wody z szafirem',
    publishedOnCurrentPublication: false,
  },
  {
    handle: 'zloty-pierscionek-z-szafirem',
    title: 'Złoty pierścionek z szafirem',
    publishedOnCurrentPublication: true,
  },
  {
    handle: 'obraczka-z-szafirem-epir-jewellery',
    title: 'Srebrna obrączka z szafirem',
    publishedOnCurrentPublication: true,
  },
] as const;

function sapphireAdminNode(input: (typeof SAPPHIRE_FIXTURE)[number], index: number) {
  return {
    id: `gid://shopify/Product/${index + 1}`,
    handle: input.handle,
    title: input.title,
    description: `${input.title}. Szafir.`,
    vendor: 'EPIR',
    tags: ['szafir'],
    status: 'ACTIVE',
    publishedOnCurrentPublication: input.publishedOnCurrentPublication,
    onlineStoreUrl: `https://epirbizuteria.pl/products/${input.handle}`,
    variants: {
      nodes: [
        {
          id: `gid://shopify/ProductVariant/${index + 1}`,
          title: '12',
          sku: `szafir-${index}`,
          availableForSale: true,
          price: '310.00',
          selectedOptions: [{name: 'Rozmiar', value: '12'}],
        },
      ],
    },
  };
}

describe('Etap 1 live-store hotfix', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps all four sapphire cards when two are unpublished on the app publication', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({data: {products: {nodes: SAPPHIRE_FIXTURE.map(sapphireAdminNode)}}}),
          {status: 200, headers: {'Content-Type': 'application/json'}},
        ),
      ),
    );

    const found = await fetchStoreProductsByQuery(
      {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'admin-token'},
      'szafir',
      'epir',
    );
    expect(found.ok).toBe(true);
    expect(found.products.map((product) => product.handle)).toEqual(SAPPHIRE_FIXTURE.map((item) => item.handle));
    expect(found.products.every((product) => String(product.url).includes('epirbizuteria.pl/products/'))).toBe(true);

    const seeded = await seedBuyerTurnContext({
      env: {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'admin-token'},
      brand: 'epir',
      buyerTurns: ['pierścionek z szafirem'],
    });
    expect(seeded.stoneLookup).toBe('hit');
    const cards = seeded.snapshots.flatMap((snapshot) => readPresentedProducts(snapshot));
    expect(cards.map((card) => card.handle).sort()).toEqual([...SAPPHIRE_FIXTURE.map((item) => item.handle)].sort());
    expect(cards.every((card) => String(card.url).startsWith('https://epirbizuteria.pl/products/'))).toBe(true);
    expect(seeded.lines.join('\n')).not.toContain('Nie mam teraz w ofercie');
  });

  it('returns Kazka Solitery from Storefront with kazka.epirbizuteria.pl URLs', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain('/api/2024-10/graphql.json');
      const body = JSON.parse(String(init?.body ?? '{}')) as {query?: string};
      expect(body.query ?? '').not.toMatch(/\bstatus\b/);
      expect(body.query ?? '').not.toContain('publishedOnCurrentPublication');
      expect(body.query ?? '').toContain('variants(first: 250)');
      return new Response(
        JSON.stringify({
          data: {
            products: {
              nodes: [
                {
                  id: 'gid://shopify/Product/200',
                  handle: 'kolczyki-soliter-motylek',
                  title: 'Kolczyki Soliter Motylek',
                  description: 'Kolczyki.',
                  vendor: 'Kazka',
                  tags: ['kazka'],
                  variants: {
                    nodes: [
                      {
                        id: 'gid://shopify/ProductVariant/200',
                        title: 'Default',
                        availableForSale: true,
                        price: {amount: '5579.06', currencyCode: 'PLN'},
                      },
                    ],
                  },
                },
                {
                  id: 'gid://shopify/Product/101',
                  handle: '101-10010-3-7',
                  title: 'Pierścionek Soliter',
                  description: 'Soliter, brylant.',
                  vendor: 'Kazka',
                  tags: ['kazka', 'soliter'],
                  options: [{name: 'Jakość', values: ['BLACK', 'D/VVS2', 'F/VS2', 'G/SI', 'G/VS2', 'LAB']}],
                  variants: {
                    nodes: [
                      {
                        id: 'gid://shopify/ProductVariant/101',
                        title: 'Default',
                        sku: 'KAZKA-SOLITER',
                        availableForSale: true,
                        price: {amount: '4001.14', currencyCode: 'PLN'},
                        selectedOptions: [{name: 'Jakość', value: 'BLACK'}],
                      },
                    ],
                  },
                },
                {
                  id: 'gid://shopify/Product/102',
                  handle: '101-10019',
                  title: 'Pierścionek Soliter klasyczny',
                  description: 'Soliter.',
                  vendor: 'Kazka',
                  tags: ['kazka'],
                  variants: {
                    nodes: [
                      {
                        id: 'gid://shopify/ProductVariant/102',
                        title: 'Default',
                        sku: 'KAZKA-SOLITER-2',
                        availableForSale: true,
                        price: {amount: '3729.62', currencyCode: 'PLN'},
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
    vi.stubGlobal('fetch', fetchMock);

    const env = {SHOP_DOMAIN: SHOP, PUBLIC_STOREFRONT_API_TOKEN_KAZKA: 'kazka-sf'};
    const seeded = await seedBuyerTurnContext({
      env,
      brand: 'kazka',
      buyerTurns: ['soliter'],
    });
    expect(seeded.stoneLookup).toBe('hit');
    const cards = seeded.snapshots.flatMap((snapshot) => readPresentedProducts(snapshot));
    expect(cards.map((card) => card.handle).sort()).toEqual(['101-10010-3-7', '101-10019'].sort());
    expect(cards.every((card) => String(card.url).startsWith('https://kazka.epirbizuteria.pl/products/'))).toBe(true);
    expect(JSON.stringify(cards)).not.toContain('kolczyki');
    expect(JSON.stringify(cards)).not.toContain('https://epirbizuteria.pl/products/');
  });

  it('keeps LAB and G/VS2 on Soliter when variants are truncated but options list Jakość', async () => {
    const {presentCatalogForModel} = await import('../src/mcp/catalog-for-model');
    const {mapStoreProduct} = await import('../src/catalog/stone-retrieval');
    const mapped = mapStoreProduct(
      {
        id: 'gid://shopify/Product/101',
        handle: '101-10010-3-7',
        title: 'Pierścionek Soliter',
        vendor: 'Kazka',
        tags: ['kazka'],
        options: [{name: 'Jakość', values: ['BLACK', 'D/VVS2', 'F/VS2', 'G/SI', 'G/VS2', 'LAB']}],
        variants: {
          nodes: Array.from({length: 25}, (_, index) => ({
            id: `gid://shopify/ProductVariant/${index}`,
            title: `nat-${index}`,
            availableForSale: true,
            price: {amount: '4000.00', currencyCode: 'PLN'},
            selectedOptions: [{name: 'Jakość', value: index % 2 ? 'BLACK' : 'D/VVS2'}],
          })),
        },
      },
      {kazkaStorefront: true},
    );
    const presented = presentCatalogForModel({products: [mapped]}, {brand: 'kazka'});
    const card = readPresentedProducts(presented)[0]!;
    const qualities = JSON.stringify(card.quality_price_groups ?? card.options);
    expect(qualities).toMatch(/LAB/);
    expect(qualities).toMatch(/G\/VS2/);
    expect(card.url).toBe('https://kazka.epirbizuteria.pl/products/101-10010-3-7');
  });
});
