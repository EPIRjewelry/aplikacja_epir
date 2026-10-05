import {afterEach, describe, expect, it, vi} from 'vitest';
import {guardBuyerCatalogReply, STALE_PRODUCT_CONTEXT_REPLY} from '../src/catalog/buyer-reply-guard';
import {seedBuyerTurnContext} from '../src/catalog/turn-seed';
import {formatPlnMajorForDisplay} from '../src/mcp/catalog-price-enrich';

const SHOP = 'epir-art-silver-jewellery.myshopify.com';
const CLASSIC_TURNS = ['szukam piersconka, ale klasycznego', 'srebro'] as const;

function shopNode(input: {
  handle: string;
  title: string;
  description: string;
  vendor: string;
  tags: string[];
  sizes: string[];
  metals?: string[];
  price: string;
}) {
  const options = [{name: 'Rozmiar', optionValues: input.sizes.map((size) => ({name: size}))}];
  if (input.metals?.length) {
    options.push({name: 'Metal', optionValues: input.metals.map((metal) => ({name: metal}))});
  }
  return {
    id: `gid://shopify/Product/${input.handle}`,
    handle: input.handle,
    title: input.title,
    description: input.description,
    vendor: input.vendor,
    tags: input.tags,
    onlineStoreUrl: `https://${SHOP}/products/${input.handle}`,
    options,
    metafields: {nodes: []},
    variants: {
      nodes: input.sizes.map((size, index) => ({
        id: `gid://shopify/ProductVariant/${input.handle}-${index}`,
        title: size,
        sku: `${input.handle}-${size}`,
        availableForSale: true,
        price: input.price,
        selectedOptions: [{name: 'Rozmiar', value: size}],
      })),
    },
  };
}

function adminResponse(nodes: unknown[]) {
  return new Response(JSON.stringify({data: {products: {nodes}}}), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  });
}

function queryOf(init: RequestInit | undefined): string {
  if (!init?.body || typeof init.body !== 'string') return '';
  const parsed = JSON.parse(init.body) as {variables?: {query?: string}};
  return parsed.variables?.query ?? '';
}

describe('classic ring plus metal stays on the EPIR catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists classic silver rings from the card search and does not leak the list rule', async () => {
    const silver = shopNode({
      handle: 'klasyczna-obraczka-srebrna',
      title: 'Klasyczna obrączka srebrna',
      description: 'Obrączka, srebro.',
      vendor: 'EPIR',
      tags: ['srebro', 'klasyczna'],
      sizes: ['12', '14'],
      metals: ['srebro'],
      price: '890.00',
    });
    const second = shopNode({
      handle: 'szeroka-obraczka-klasyczna',
      title: 'Szeroka obrączka klasyczna',
      description: 'Srebro, gładki kontur.',
      vendor: 'EPIR',
      tags: ['srebro'],
      sizes: ['10', '16'],
      metals: ['srebro'],
      price: '640.00',
    });
    const gold = shopNode({
      handle: 'klasyczna-obraczka-zlota',
      title: 'Klasyczna obrączka złota',
      description: 'Obrączka, żółte złoto.',
      vendor: 'EPIR',
      tags: ['złoto'],
      sizes: ['12'],
      metals: ['żółte złoto'],
      price: '2400.00',
    });
    const kazka = shopNode({
      handle: 'soliter-kazka',
      title: 'Pierścionek Soliter',
      description: 'Srebro.',
      vendor: 'Kazka',
      tags: ['kazka', 'srebro'],
      sizes: ['12'],
      metals: ['srebro'],
      price: '3985.00',
    });
    const necklace = shopNode({
      handle: 'naszyjnik-srebrny-klasyczny',
      title: 'Naszyjnik srebrny klasyczny',
      description: 'Srebro.',
      vendor: 'EPIR',
      tags: ['srebro'],
      sizes: ['45'],
      price: '520.00',
    });
    const queries: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        queries.push(queryOf(init));
        return adminResponse([silver, second, gold, kazka, necklace]);
      }),
    );

    const seeded = await seedBuyerTurnContext({
      env: {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'token'},
      brand: 'epir',
      buyerTurns: CLASSIC_TURNS,
    });
    const blob = seeded.lines.join('\n');
    expect(seeded.stoneLookup).toBe('hit');
    expect(queries[0]).toContain('pierścionek klasyczny srebro');
    expect(blob).toContain('klasyczna-obraczka-srebrna');
    expect(blob).toContain('szeroka-obraczka-klasyczna');
    expect(blob).toContain(formatPlnMajorForDisplay(890));
    expect(blob).toContain(formatPlnMajorForDisplay(640));
    expect(blob).toContain('12, 14');
    expect(blob).toContain('https://epirbizuteria.pl/products/klasyczna-obraczka-srebrna');
    expect(blob).not.toContain('klasyczna-obraczka-zlota');
    expect(blob).not.toContain('soliter-kazka');
    expect(blob).not.toContain('naszyjnik-srebrny-klasyczny');
    expect(blob).not.toMatch(/nie wracam do poprzedniej/i);
    expect(blob).not.toMatch(/metal biorę z karty/i);

    const guarded = guardBuyerCatalogReply(STALE_PRODUCT_CONTEXT_REPLY, {
      buyerTurns: CLASSIC_TURNS,
      catalogSnapshots: seeded.snapshots,
    });
    expect(guarded.replaced).toBe(true);
    expect(guarded.reason).toBe('discovery_metal');
    expect(guarded.text).toContain('https://epirbizuteria.pl/products/klasyczna-obraczka-srebrna');
    expect(guarded.text).toContain(formatPlnMajorForDisplay(890));
    expect(guarded.text).toContain('rozmiary 12, 14');
    expect(guarded.text).toContain('szeroka-obraczka-klasyczna');
    expect(guarded.text).not.toBe(STALE_PRODUCT_CONTEXT_REPLY);
    expect(guarded.text).not.toMatch(/nie wracam do poprzedniej/i);
    expect(guarded.text).not.toMatch(/metal biorę z karty/i);
  });

  it('keeps the classic ring when the metal answer is gold', async () => {
    const gold = shopNode({
      handle: 'klasyczna-obraczka-zlota',
      title: 'Klasyczna obrączka złota',
      description: 'Żółte złoto.',
      vendor: 'EPIR',
      tags: ['złoto'],
      sizes: ['13', '15'],
      metals: ['żółte złoto'],
      price: '2400.00',
    });
    const queries: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        queries.push(queryOf(init));
        return adminResponse([gold]);
      }),
    );
    const seeded = await seedBuyerTurnContext({
      env: {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'token'},
      brand: 'epir',
      buyerTurns: ['szukam pierścionka klasycznego', 'złoto'],
    });
    expect(queries.some((query) => query.includes('złoto'))).toBe(true);
    expect(seeded.lines.join('\n')).toContain('klasyczna-obraczka-zlota');
    expect(seeded.lines.join('\n')).toContain(formatPlnMajorForDisplay(2400));
    const guarded = guardBuyerCatalogReply(STALE_PRODUCT_CONTEXT_REPLY, {
      buyerTurns: ['szukam pierścionka klasycznego', 'złoto'],
      catalogSnapshots: seeded.snapshots,
    });
    expect(guarded.reason).toBe('discovery_metal');
    expect(guarded.text).toContain('/products/klasyczna-obraczka-zlota');
    expect(guarded.text).not.toMatch(/nie wracam do poprzedniej/i);
  });

  it('does not reopen a sapphire list when the metal follows a stone ask', async () => {
    const fetchMock = vi.fn(async () => adminResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const seeded = await seedBuyerTurnContext({
      env: {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'token'},
      brand: 'epir',
      buyerTurns: ['cos z szafirem', 'srebro'],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(seeded.snapshots).toEqual([]);
  });
});
