import {afterEach, describe, expect, it, vi} from 'vitest';
import {callMcpToolDirect} from '../src/mcp_server';
import {formatPlnMajorForDisplay} from '../src/mcp/catalog-price-enrich';
import {presentCatalogForModel} from '../src/mcp/catalog-for-model';

/**
 * Odpowiednik żywego odczytu UCP (structuredContent, amount w groszach).
 * Model dostaje JSON.stringify(result) obcięty do 3000 znaków — karta musi
 * zmieścić tytuł, price_display_pl i variant id w tym oknie.
 */
const TOOL_OUTPUT_LIMIT = 3000;
const SHOP = 'epir-art-silver-jewellery.myshopify.com';
const PROFILE = 'https://asystent.epirbizuteria.pl/.well-known/ucp-agent-profile.json';
const GALAZKI_VARIANT = 'gid://shopify/ProductVariant/9001';
const SOLITER_VARIANT = 'gid://shopify/ProductVariant/9002';

function env() {
  return {
    SHOP_DOMAIN: SHOP,
    WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl',
  } as any;
}

function ucpResult(products: unknown[]) {
  return {
    structuredContent: {
      ucp: {
        version: '2026-08-25',
        capabilities: {
          'dev.ucp.shopping.catalog.search': [{version: '2026-08-25'}],
          'dev.shopify.catalog': [{version: '2026-08-25'}],
        },
      },
      products,
    },
    content: [
      {
        type: 'text',
        text: 'A'.repeat(8000),
      },
    ],
  };
}

function fatProduct(input: {
  id: string;
  title: string;
  handle: string;
  variantId: string;
  amount: number;
  vendor: string;
  tags: string[];
}) {
  return {
    id: input.id,
    handle: input.handle,
    title: input.title,
    description: {html: `<p>${'opis '.repeat(400)}</p>`},
    url: `https://epirbizuteria.pl/products/${input.handle}`,
    vendor: input.vendor,
    tags: input.tags,
    categories: [{value: 'Biżuteria', taxonomy: 'merchant'}],
    price_range: {
      min: {amount: input.amount, currency: 'PLN'},
      max: {amount: input.amount, currency: 'PLN'},
    },
    media: Array.from({length: 4}, (_, index) => ({
      type: 'image',
      url: `https://cdn.shopify.com/s/files/jewelry-${input.handle}-${index}.jpg?v=1234567890`,
      alt_text: input.title,
    })),
    options: [
      {
        name: 'Rozmiar',
        values: Array.from({length: 16}, (_, index) => ({label: String(8 + index)})),
      },
    ],
    variants: Array.from({length: 16}, (_, index) => ({
      id: index === 0 ? input.variantId : `gid://shopify/ProductVariant/${9100 + index}`,
      sku: `${input.handle}-${index}`,
      title: String(8 + index),
      description: {plain: 'wariant '.repeat(40)},
      price: {amount: input.amount, currency: 'PLN'},
      availability: {available: true},
      options: [{name: 'Rozmiar', label: String(8 + index)}],
    })),
  };
}

function mcpResponse(result: unknown) {
  return new Response(JSON.stringify({jsonrpc: '2.0', id: 1, result}), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  });
}

function modelWire(result: unknown): string {
  return JSON.stringify(result);
}

function productsOf(result: unknown): Array<Record<string, unknown>> {
  const text = (result as {content?: Array<{text?: string}>}).content?.[0]?.text ?? '{}';
  const parsed = JSON.parse(text) as {products?: Array<Record<string, unknown>>};
  return parsed.products ?? [];
}

describe('presentCatalogForModel', () => {
  it('turns UCP minor units into price_display_pl and drops the raw amount', () => {
    const presented = presentCatalogForModel(
      ucpResult([
        fatProduct({
          id: 'gid://shopify/Product/1',
          title: 'Pierścionek z czarnym turmalinem z kolekcji Gałązki',
          handle: 'galazki-turmalin',
          variantId: GALAZKI_VARIANT,
          amount: 1899,
          vendor: 'EPIR',
          tags: ['srebro'],
        }),
      ]),
    );
    const [product] = productsOf(presented);
    expect(product?.price_display_pl).toBe(formatPlnMajorForDisplay(18.99));
    expect(product?.price_display_pl).not.toBe(formatPlnMajorForDisplay(1899));
    expect(modelWire(presented)).not.toContain('"amount"');
    expect(product?.variant_id).toBe(GALAZKI_VARIANT);
  });

  it('puts Soliter on the Kazka host and keeps the EPIR card on the apex', () => {
    const soliter = (url: unknown) =>
      ucpResult([
        {
          ...fatProduct({
            id: 'gid://shopify/Product/2',
            title: 'Pierścionek Soliter',
            handle: 'soliter',
            variantId: SOLITER_VARIANT,
            amount: 640800,
            vendor: 'Kazka',
            tags: ['kazka'],
          }),
          url,
        },
      ]);

    const absolute = /^https:\/\/[^/?#]+\/products\/soliter$/;
    const kazkaFromApex = productsOf(
      presentCatalogForModel(soliter('https://epirbizuteria.pl/products/soliter'), {brand: 'kazka'}),
    )[0];
    const kazkaFromBare = productsOf(presentCatalogForModel(soliter('https://'), {brand: 'kazka'}))[0];
    const epir = productsOf(
      presentCatalogForModel(soliter('https://epirbizuteria.pl/products/soliter?variant=1'), {brand: 'epir'}),
    )[0];

    expect(kazkaFromApex?.url).toBe('https://kazka.epirbizuteria.pl/products/soliter');
    expect(kazkaFromApex?.url).toMatch(absolute);
    expect(kazkaFromApex?.price_display_pl).toBe(formatPlnMajorForDisplay(6408));
    expect(kazkaFromBare?.url).toBe('https://kazka.epirbizuteria.pl/products/soliter');
    expect(kazkaFromBare?.url).not.toBe('https://');
    expect(epir?.url).toBe('https://epirbizuteria.pl/products/soliter');
    expect(epir?.url).toMatch(absolute);
    expect(epir?.price_display_pl).toBe(formatPlnMajorForDisplay(6408));
  });

  it('keeps every product price inside the 3000-character tool window', () => {
    const products = [312000, 450000, 189900].map((amount, index) =>
      fatProduct({
        id: `gid://shopify/Product/${index + 1}`,
        title: `Pierścionek ${index + 1} z kolekcji Gałązki`,
        handle: `pierscionek-${index + 1}`,
        variantId: `gid://shopify/ProductVariant/${9000 + index}`,
        amount,
        vendor: index === 1 ? 'Kazka' : 'EPIR',
        tags: index === 1 ? ['kazka'] : ['srebro'],
      }),
    );
    const wire = modelWire(presentCatalogForModel(ucpResult(products)));
    expect(wire.length).toBeLessThan(TOOL_OUTPUT_LIMIT);
    expect(wire.slice(0, TOOL_OUTPUT_LIMIT)).toContain(formatPlnMajorForDisplay(3120));
    expect(wire.slice(0, TOOL_OUTPUT_LIMIT)).toContain(formatPlnMajorForDisplay(4500));
    expect(wire.slice(0, TOOL_OUTPUT_LIMIT)).toContain(formatPlnMajorForDisplay(1899));
  });
});

describe('buyer catalog and cart transcript', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('EPIR Gałązki: model wire contains the product, a PLN price, and a variant id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mcpResponse(
          ucpResult([
            fatProduct({
              id: 'gid://shopify/Product/1',
              title: 'Pierścionek z czarnym turmalinem z kolekcji Gałązki',
              handle: 'galazki-turmalin',
              variantId: GALAZKI_VARIANT,
              amount: 312000,
              vendor: 'EPIR',
              tags: ['srebro', 'organika'],
            }),
          ]),
        ),
      ),
    );

    const out = await callMcpToolDirect(env(), 'search_catalog', {
      catalog: {query: 'pierścionek Gałązki'},
    }, {brand: 'epir'});

    const wire = modelWire((out as {result: unknown}).result);
    const visible = wire.slice(0, TOOL_OUTPUT_LIMIT);
    expect(wire.length).toBeLessThan(TOOL_OUTPUT_LIMIT);
    expect(visible).toContain('Gałązki');
    expect(visible).toContain(formatPlnMajorForDisplay(3120));
    expect(visible).toContain(GALAZKI_VARIANT);
    expect(visible).not.toContain('opis opis');
    expect((out as {error?: unknown}).error).toBeUndefined();
  });

  it('transcript: KAZKA Soliter card keeps the Kazka URL and EPIR omits that product', async () => {
    const soliter = fatProduct({
      id: 'gid://shopify/Product/2',
      title: 'Pierścionek Soliter',
      handle: 'soliter',
      variantId: SOLITER_VARIANT,
      amount: 640800,
      vendor: 'Kazka',
      tags: ['kazka'],
    });
    vi.stubGlobal('fetch', vi.fn(async () => mcpResponse(ucpResult([soliter]))));

    const kazka = await callMcpToolDirect(
      env(),
      'search_catalog',
      {catalog: {query: 'Pokaż pierścionek Soliter i podaj cenę.'}},
      {brand: 'kazka'},
    );
    const epir = await callMcpToolDirect(
      env(),
      'search_catalog',
      {catalog: {query: 'Pokaż pierścionek Soliter i podaj cenę.'}},
      {brand: 'epir'},
    );
    const kazkaCard = productsOf((kazka as {result: unknown}).result)[0];
    const epirWire = modelWire((epir as {result: unknown}).result);
    const absolute = /^https:\/\/[^/?#]+\/products\/soliter$/;

    expect(kazkaCard?.title).toBe('Pierścionek Soliter');
    expect(kazkaCard?.price_display_pl).toBe(formatPlnMajorForDisplay(6408));
    expect(kazkaCard?.url).toBe('https://kazka.epirbizuteria.pl/products/soliter');
    expect(kazkaCard?.url).toMatch(absolute);
    expect(epirWire).not.toContain('Pierścionek Soliter');
    expect(epirWire).not.toContain('/products/soliter');
  });

  it('EPIR card drops Kazka Soliter; Kazka card keeps the Kazka URL and 6408 zł', async () => {
    const handle = '101-10500-2-0-em';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mcpResponse(
          ucpResult([
            fatProduct({
              id: 'gid://shopify/Product/1',
              title: 'Pierścionek z czarnym turmalinem z kolekcji Gałązki',
              handle: 'galazki-turmalin',
              variantId: GALAZKI_VARIANT,
              amount: 312000,
              vendor: 'EPIR',
              tags: ['srebro'],
            }),
            fatProduct({
              id: 'gid://shopify/Product/2',
              title: 'Pierścionek Soliter',
              handle,
              variantId: SOLITER_VARIANT,
              amount: 640800,
              vendor: 'Kazka',
              tags: ['kazka'],
            }),
          ]),
        ),
      ),
    );

    const epir = await callMcpToolDirect(
      env(),
      'search_catalog',
      {catalog: {query: 'Pokaż pierścionek Soliter i podaj cenę.'}},
      {brand: 'epir'},
    );
    const kazka = await callMcpToolDirect(
      env(),
      'search_catalog',
      {catalog: {query: 'Pokaż pierścionek Soliter i podaj cenę.'}},
      {brand: 'kazka'},
    );
    const epirWire = modelWire((epir as {result: unknown}).result);
    const kazkaProducts = productsOf((kazka as {result: unknown}).result);
    const kazkaCard = kazkaProducts[0];

    expect(epirWire).not.toContain('Pierścionek Soliter');
    expect(epirWire).not.toContain(handle);
    expect(epirWire).toContain('Gałązki');
    expect(kazkaProducts.map((product) => product.title)).toEqual(['Pierścionek Soliter']);
    expect(kazkaCard?.url).toBe(`https://kazka.epirbizuteria.pl/products/${handle}`);
    expect(kazkaCard?.price_display_pl).toBe(formatPlnMajorForDisplay(6408));
  });

  it('KAZKA Soliter at 4500 PLN stays, EPIR Gałązki does not, and the price is quoted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mcpResponse(
          ucpResult([
            fatProduct({
              id: 'gid://shopify/Product/1',
              title: 'Pierścionek z czarnym turmalinem z kolekcji Gałązki',
              handle: 'galazki-turmalin',
              variantId: GALAZKI_VARIANT,
              amount: 312000,
              vendor: 'EPIR',
              tags: ['srebro'],
            }),
            fatProduct({
              id: 'gid://shopify/Product/2',
              title: 'Pierścionek Soliter',
              handle: 'soliter',
              variantId: SOLITER_VARIANT,
              amount: 450000,
              vendor: 'Kazka',
              tags: ['kazka'],
            }),
          ]),
        ),
      ),
    );

    const out = await callMcpToolDirect(
      env(),
      'search_catalog',
      {catalog: {query: 'pierścionek Soliter do 5000 zł'}},
      {brand: 'kazka'},
    );
    const wire = modelWire((out as {result: unknown}).result);
    const products = productsOf((out as {result: unknown}).result);
    expect(products.map((product) => product.title)).toEqual(['Pierścionek Soliter']);
    expect(wire).toContain(formatPlnMajorForDisplay(4500));
    expect(wire).toContain(SOLITER_VARIANT);
    expect(wire).not.toContain('Gałązki');
    expect(wire.length).toBeLessThan(TOOL_OUTPUT_LIMIT);
    expect(wire).not.toContain('Przepraszam, chwilowo nie mogę');
  });

  it('lookup_catalog sends catalog.ids and returns the same price card', async () => {
    const fetchMock = vi.fn(async () =>
      mcpResponse({
        structuredContent: {
          products: [
            fatProduct({
              id: 'gid://shopify/Product/1',
              title: 'Pierścionek z czarnym turmalinem z kolekcji Gałązki',
              handle: 'galazki-turmalin',
              variantId: GALAZKI_VARIANT,
              amount: 312000,
              vendor: 'EPIR',
              tags: ['srebro'],
            }),
          ],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await callMcpToolDirect(env(), 'lookup_catalog', {
      catalog: {product_id: 'gid://shopify/Product/1', handle: 'galazki-turmalin'},
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/ucp/mcp');
    expect(body.params.name).toBe('lookup_catalog');
    expect(body.params.arguments.catalog.ids).toEqual([
      'gid://shopify/Product/1',
      'galazki-turmalin',
    ]);
    expect(body.params.arguments.meta['ucp-agent'].profile).toBe(PROFILE);
    const wire = modelWire((out as {result: unknown}).result);
    expect(wire).toContain(formatPlnMajorForDisplay(3120));
    expect(wire).toContain(GALAZKI_VARIANT);
  });

  it('create, get, and full-replace update: cart line price is readable and a line can be removed', async () => {
    const cartId = 'gid://shopify/Cart/abc?key=secret';
    const filled = {
      id: cartId,
      continue_url: 'https://epir-art-silver-jewellery.myshopify.com/cart/c/abc',
      currency: 'PLN',
      line_items: [
        {
          id: 'gid://shopify/CartLine/1',
          quantity: 1,
          item: {
            id: GALAZKI_VARIANT,
            title: 'Pierścionek z czarnym turmalinem z kolekcji Gałązki',
            price: {amount: 312000, currency: 'PLN'},
          },
        },
      ],
      totals: [{type: 'subtotal', amount: 312000, currency: 'PLN'}],
    };
    const empty = {
      id: cartId,
      continue_url: filled.continue_url,
      currency: 'PLN',
      line_items: [],
      totals: [{type: 'subtotal', amount: 0, currency: 'PLN'}],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mcpResponse({structuredContent: {cart: filled}}))
      .mockResolvedValueOnce(mcpResponse({structuredContent: {cart: filled}}))
      .mockResolvedValueOnce(mcpResponse({structuredContent: {cart: empty}}));
    vi.stubGlobal('fetch', fetchMock);

    const created = await callMcpToolDirect(env(), 'create_cart', {
      line_items: [{quantity: 1, item: {id: GALAZKI_VARIANT}}],
    });
    const createBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(createBody.params.name).toBe('create_cart');
    expect(createBody.params.arguments.cart.line_items).toEqual([
      {quantity: 1, item: {id: GALAZKI_VARIANT}},
    ]);
    expect(createBody.params.arguments.meta['ucp-agent'].profile).toBe(PROFILE);
    expect((created as {result: {continue_url?: string}}).result.continue_url).toBe(filled.continue_url);

    const read = await callMcpToolDirect(env(), 'get_cart', {cart_id: cartId});
    const readWire = modelWire((read as {result: unknown}).result);
    expect(readWire).toContain(GALAZKI_VARIANT);
    expect(readWire).toContain(formatPlnMajorForDisplay(3120));
    expect(readWire).toContain('Gałązki');

    const removed = await callMcpToolDirect(env(), 'update_cart', {
      cart_id: cartId,
      line_items: [],
    });
    const updateBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(updateBody.params.name).toBe('update_cart');
    expect(updateBody.params.arguments.cart.line_items).toEqual([]);
    expect(updateBody.params.arguments.meta['ucp-agent'].profile).toBe(PROFILE);
    expect((removed as {result: {line_items?: unknown[]}}).result.line_items).toEqual([]);
  });
});
