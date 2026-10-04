import {afterEach, describe, expect, it, vi} from 'vitest';
import {callMcpToolDirect} from '../src/mcp_server';
import {formatPlnMajorForDisplay} from '../src/mcp/catalog-price-enrich';
import {CATALOG_MODEL_WIRE_BUDGET, presentCatalogForModel} from '../src/mcp/catalog-for-model';

/**
 * Odpowiednik żywego odczytu UCP (structuredContent, amount w groszach).
 * Model dostaje całą kartę w oknie narzędzia katalogu — opis, rozmiary i każdy wariant.
 */
const TOOL_OUTPUT_LIMIT = CATALOG_MODEL_WIRE_BUDGET;
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
    const variants = product?.variants as Array<Record<string, unknown>>;
    const sizes = product?.sizes as string[];
    expect(product?.price_is_flat).toBe(true);
    expect(product?.price_display_pl).toBe(formatPlnMajorForDisplay(18.99));
    expect(product?.page_price_display_pl).toBe(formatPlnMajorForDisplay(18.99));
    expect(product?.price_display_pl).not.toBe(formatPlnMajorForDisplay(1899));
    expect(product?.price_min_display_pl).toBeUndefined();
    expect(modelWire(presented)).not.toContain('"amount"');
    expect(product?.variant_id).toBeUndefined();
    expect(variants).toHaveLength(16);
    expect(variants[0]?.id).toBe(GALAZKI_VARIANT);
    expect(sizes).toHaveLength(16);
    expect(sizes[0]).toBe('8');
    expect(sizes[15]).toBe('23');
    expect(product?.description).toContain('opis');
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

  it('keeps a flat silver ring at one price and the real size list 7–29', () => {
    const sizes = Array.from({length: 23}, (_, index) => String(7 + index));
    const presented = presentCatalogForModel(
      ucpResult([
        {
          id: 'gid://shopify/Product/srebro',
          title: 'Pierścionek srebrny',
          handle: 'pierscionek-srebrny',
          description: {html: '<p>Srebro młotkowane. Bez kamienia.</p>'},
          url: 'https://epirbizuteria.pl/products/pierscionek-srebrny',
          vendor: 'EPIR',
          tags: ['srebro', '10-dni'],
          price_range: {
            min: {amount: 26000, currency: 'PLN'},
            max: {amount: 26000, currency: 'PLN'},
          },
          options: [{name: 'Rozmiar', values: sizes.map((label) => ({label}))}],
          metafields: [
            {namespace: 'custom', key: 'proba', value: '925'},
            {namespace: 'custom', key: 'czas_dostawy', value: '24h'},
            {namespace: 'custom', key: 'grawer', value: 'inicjały'},
            {
              namespace: 'custom',
              key: 'glowny_kamien',
              reference: {fields: [{key: 'name', value: 'kwarc'}]},
            },
          ],
          variants: sizes.map((size, index) => ({
            id: `gid://shopify/ProductVariant/${7000 + index}`,
            title: size,
            sku: `SR-${size}`,
            price: {amount: 26000, currency: 'PLN'},
            availability: {available: true},
            options: [{name: 'Rozmiar', value: size}],
          })),
        },
      ]),
      {brand: 'epir'},
    );
    const [product] = productsOf(presented);
    const wire = modelWire(presented);
    const variants = product?.variants as Array<Record<string, unknown>>;
    expect(product?.price_is_flat).toBe(true);
    expect(product?.price_display_pl).toBe('260 zł');
    expect(product?.page_price_display_pl).toBe('260 zł');
    expect(product?.price_min_display_pl).toBeUndefined();
    expect(product?.variant_id).toBeUndefined();
    expect(product?.sizes).toEqual(sizes);
    expect(variants).toHaveLength(23);
    expect(variants[0]?.price_display_pl).toBe('260 zł');
    expect(variants[22]?.title).toBe('29');
    expect(product?.description).toContain('Srebro młotkowane');
    expect(wire).not.toContain('925');
    expect(wire).not.toContain('24h');
    expect(wire).not.toContain('inicjały');
    expect(wire).toContain('kwarc');
    expect(product?.lead_time_display_pl).toBeUndefined();
    expect(wire).not.toContain('kazka.epirbizuteria.pl');
  });

  it('keeps strawberry quartz at 280 zł and sizes 9–25, and drops a Kazka host from the description', () => {
    const sizes = Array.from({length: 17}, (_, index) => String(9 + index));
    const presented = presentCatalogForModel(
      ucpResult([
        {
          id: 'gid://shopify/Product/kwarc',
          title: 'Pierścionek z kwarcem truskawkowym',
          handle: 'kwarc-truskawkowy',
          description: {
            plain: 'Kwarc truskawkowy. Zobacz też https://kazka.epirbizuteria.pl/products/soliter',
          },
          url: 'https://kazka.epirbizuteria.pl/products/kwarc-truskawkowy',
          vendor: 'EPIR',
          tags: ['srebro'],
          options: [{name: 'Rozmiar', values: sizes}],
          variants: sizes.map((size, index) => ({
            id: `gid://shopify/ProductVariant/${8000 + index}`,
            title: size,
            price: {amount: 28000, currency: 'PLN'},
            options: [{name: 'Rozmiar', label: size}],
          })),
        },
      ]),
      {brand: 'epir'},
    );
    const [product] = productsOf(presented);
    const sizesOut = product?.sizes as string[];
    expect(product?.price_display_pl).toBe('280 zł');
    expect(product?.price_is_flat).toBe(true);
    expect(sizesOut).toHaveLength(17);
    expect(sizesOut[0]).toBe('9');
    expect(sizesOut[sizesOut.length - 1]).toBe('25');
    expect(sizesOut).not.toEqual(sizesOut.slice(0, 12));
    expect(product?.url).toBe('https://epirbizuteria.pl/products/kwarc-truskawkowy');
    expect(modelWire(presented)).not.toContain('kazka.epirbizuteria.pl');
    expect(product?.description).toContain('Kwarc truskawkowy');
  });

  it('quotes a range only when variant prices differ and keeps each variant price', () => {
    const presented = presentCatalogForModel(
      ucpResult([
        {
          id: 'gid://shopify/Product/mix',
          title: 'Pierścionek z dwoma cenami',
          handle: 'dwa-ceny',
          url: 'https://epirbizuteria.pl/products/dwa-ceny',
          options: [{name: 'Rozmiar', values: ['7', '29']}],
          variants: [
            {
              id: 'gid://shopify/ProductVariant/1',
              title: '7',
              price: {amount: 26000, currency: 'PLN'},
              options: [{name: 'Rozmiar', value: '7'}, {name: 'Kamień', value: 'kwarc'}],
            },
            {
              id: 'gid://shopify/ProductVariant/2',
              title: '29',
              price: {amount: 48000, currency: 'PLN'},
              options: [{name: 'Rozmiar', value: '29'}],
            },
          ],
        },
      ]),
      {brand: 'epir'},
    );
    const [product] = productsOf(presented);
    const variants = product?.variants as Array<Record<string, unknown>>;
    expect(product?.price_is_flat).toBe(false);
    expect(product?.price_display_pl).toBeUndefined();
    expect(product?.page_price_display_pl).toBe('od 260 zł');
    expect(product?.price_min_display_pl).toBe('260 zł');
    expect(product?.price_max_display_pl).toBe('480 zł');
    expect(product?.variant_id).toBeUndefined();
    expect(variants[0]?.options).toEqual([
      {name: 'Rozmiar', value: '7'},
      {name: 'Kamień', value: 'kwarc'},
    ]);
    expect(variants[1]?.options).toEqual([{name: 'Rozmiar', value: '29'}]);
    expect(variants[1]?.price_display_pl).toBe('480 zł');
  });

  it('puts Kazka lead time on the card from the metafield or the 10-day tag', () => {
    const fromMeta = productsOf(
      presentCatalogForModel(
        ucpResult([
          {
            id: 'gid://shopify/Product/k1',
            title: 'Soliter',
            handle: 'soliter',
            url: 'https://epirbizuteria.pl/products/soliter',
            vendor: 'Kazka',
            tags: ['kazka'],
            metafields: [{namespace: 'custom', key: 'czas_wykonania', value: '3'}],
            variants: [{id: 'gid://shopify/ProductVariant/1', title: '54', price: {amount: 640800, currency: 'PLN'}}],
          },
        ]),
        {brand: 'kazka'},
      ),
    )[0];
    const fromTag = productsOf(
      presentCatalogForModel(
        ucpResult([
          {
            id: 'gid://shopify/Product/k2',
            title: 'Soliter 10',
            handle: 'soliter-10',
            url: 'https://epirbizuteria.pl/products/soliter-10',
            vendor: 'Kazka',
            tags: ['kazka', '10-dni'],
            variants: [{id: 'gid://shopify/ProductVariant/2', title: '54', price: {amount: 28000, currency: 'PLN'}}],
          },
        ]),
        {brand: 'kazka'},
      ),
    )[0];
    expect(fromMeta?.lead_time_display_pl).toBe('Wykonanie 3 dni robocze');
    expect(fromMeta?.url).toBe('https://kazka.epirbizuteria.pl/products/soliter');
    expect(fromMeta?.variant_id).toBe('gid://shopify/ProductVariant/1');
    expect(fromTag?.lead_time_display_pl).toBe('Wykonanie 10 dni roboczych');
    expect(fromTag?.page_price_display_pl).toBe('280 zł');
    expect(fromTag?.url).toBe('https://kazka.epirbizuteria.pl/products/soliter-10');
    expect(modelWire(presentCatalogForModel(ucpResult([{
      id: 'gid://shopify/Product/k2',
      title: 'Soliter 10',
      handle: 'soliter-10',
      tags: ['kazka', '10-dni'],
      variants: [{id: 'gid://shopify/ProductVariant/2', title: '54', price: {amount: 28000, currency: 'PLN'}}],
    }]), {brand: 'kazka'}))).not.toMatch(/https:\/\/epirbizuteria\.pl\//);
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
    expect(visible).toContain('opis');
    expect(visible).toContain('"price_is_flat":true');
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
