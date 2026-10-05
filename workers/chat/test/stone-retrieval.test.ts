import {afterEach, describe, expect, it, vi} from 'vitest';
import {callMcpToolDirect} from '../src/mcp_server';
import {productMatchesStone} from '../src/catalog/stone-retrieval';
import {detectStoneIntent} from '../src/catalog/stone-intent';

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
    expect(mcpBody.params.arguments.catalog.query).toBe('szafir sapphire');
    expect(mcpBody.params.arguments.catalog.pagination.limit).toBe(8);

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
