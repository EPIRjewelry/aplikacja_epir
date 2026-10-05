import {afterEach, describe, expect, it, vi} from 'vitest';
import {guardBuyerCatalogReply, STALE_PRODUCT_CONTEXT_REPLY} from '../src/catalog/buyer-reply-guard';
import {guardPageProductReply, loadPageProductCard} from '../src/catalog/page-product-card';
import {planBuyerReplyFrames} from '../src/catalog/reply-commit';
import {
  EPIR_GOLD_FREE_SHIPPING_FACT,
  EPIR_SHIPPING_FACT,
  guardStoreFacts,
  KAZKA_RETURNS_FACT,
  KAZKA_SHIPPING_FACT,
} from '../src/catalog/store-facts';
import {seedBuyerTurnContext} from '../src/catalog/turn-seed';
import {formatPlnMajorForDisplay} from '../src/mcp/catalog-price-enrich';
import {KAZKA_HEADLESS_PERSONA_ADDON, LUXURY_SYSTEM_PROMPT} from '../src/prompts/luxury-system-prompt';

const SHOP = 'epir-art-silver-jewellery.myshopify.com';

function shopNode(input: {
  handle: string;
  title: string;
  description: string;
  vendor: string;
  tags: string[];
  stone?: string;
  sizes: string[];
  metals?: string[];
  priceFor: (size: string) => string;
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
    metafields: {
      nodes: input.stone ? [{namespace: 'custom', key: 'main_stone', value: input.stone}] : [],
    },
    variants: {
      nodes: input.sizes.map((size, index) => ({
        id: `gid://shopify/ProductVariant/${input.handle}-${index}`,
        title: size,
        sku: `${input.handle}-${size}`,
        availableForSale: true,
        price: input.priceFor(size),
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

describe('GK rings, facts, and reply order', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers diamond and engagement asks with rings, not an Iluzja-only necklace', async () => {
    const iluzja = shopNode({
      handle: 'naszyjnik-iluzja',
      title: 'Naszyjnik Iluzja',
      description: 'Iluzja, brylant.',
      vendor: 'Kazka',
      tags: ['kazka'],
      stone: 'brylant',
      sizes: ['40', '45'],
      priceFor: (size) => (size === '45' ? '6706.00' : '2891.00'),
    });
    const ring = shopNode({
      handle: 'pierscionek-zareczynowy-brylant',
      title: 'Pierścionek zaręczynowy z brylantem',
      description: 'Brylant, złoto.',
      vendor: 'Kazka',
      tags: ['kazka'],
      stone: 'brylant',
      sizes: ['12', '13'],
      priceFor: (size) => (size === '13' ? '8900.00' : '4200.00'),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const query = queryOf(init);
        if (query.includes('-iluzja')) return adminResponse([ring]);
        return adminResponse([iluzja]);
      }),
    );

    const diamond = await seedBuyerTurnContext({
      env: {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'token'},
      brand: 'kazka',
      buyerTurns: ['szukam pierścionka zaręczynowego z brylantem'],
    });
    const diamondBlob = diamond.lines.join('\n');
    expect(diamond.stoneLookup).toBe('hit');
    expect(diamondBlob).toContain('pierscionek-zareczynowy-brylant');
    expect(diamondBlob).toContain(formatPlnMajorForDisplay(4200));
    expect(diamondBlob).toContain(formatPlnMajorForDisplay(8900));
    expect(diamondBlob).not.toContain('naszyjnik-iluzja');
    expect(diamondBlob).not.toContain(formatPlnMajorForDisplay(2891));

    const engagement = await seedBuyerTurnContext({
      env: {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'token'},
      brand: 'kazka',
      buyerTurns: ['pokaz pierścionki zaręczynowe'],
    });
    const engagementBlob = engagement.lines.join('\n');
    expect(engagement.stoneLookup).toBe('hit');
    expect(engagementBlob).toContain('pierscionek-zareczynowy-brylant');
    expect(engagementBlob).not.toContain('Naszyjnik Iluzja');
  });

  it('puts Soliter metals on the page card and in the buyer quote', async () => {
    const metals = ['żółte złoto', 'białe złoto', 'różowe złoto'];
    const sizes = Array.from({length: 23}, (_, index) => String(7 + index));
    const soliter = shopNode({
      handle: 'soliter',
      title: 'Pierścionek Soliter',
      description: 'Soliter, brylant.',
      vendor: 'Kazka',
      tags: ['kazka'],
      stone: 'brylant',
      sizes,
      metals,
      priceFor: (size) => (size === '29' ? '5710.00' : '3985.00'),
    });
    vi.stubGlobal('fetch', vi.fn(async () => adminResponse([soliter])));
    const loaded = await loadPageProductCard(
      {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'token'},
      'soliter',
      'kazka',
    );
    expect(loaded?.card.metals).toEqual(metals);
    expect(loaded?.card.price_min_display_pl).toBe(formatPlnMajorForDisplay(3985));
    expect(loaded?.card.price_max_display_pl).toBe(formatPlnMajorForDisplay(5710));

    const quoted = guardPageProductReply(
      `Soliter od ${formatPlnMajorForDisplay(3985)} do ${formatPlnMajorForDisplay(5710)}, rozmiary 7–29.`,
      loaded!.card,
    );
    expect(quoted.replaced).toBe(true);
    expect(quoted.text).toContain('żółte złoto');
    expect(quoted.text).toContain('białe złoto');
    expect(quoted.text).toContain('różowe złoto');
    expect(quoted.text).toContain('7–29');
  });

  it('answers Kazka shipping and returns from store facts, without a false refusal', async () => {
    const fetchMock = vi.fn(async () => adminResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const seeded = await seedBuyerTurnContext({
      env: {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'token'},
      brand: 'kazka',
      buyerTurns: ['pierścionki zaręczynowe', 'ile kosztuje wysyłka i jakie są zwroty?'],
    });
    const blob = seeded.lines.join('\n');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(blob).toContain(KAZKA_SHIPPING_FACT);
    expect(blob).toContain(KAZKA_RETURNS_FACT);
    expect(blob).not.toContain('Iluzja');
    expect(seeded.snapshots).toEqual([]);

    const returns = guardStoreFacts('Nie przyjmujemy zwrotów ani zamówień indywidualnych.', 'kazka', {
      userMessage: 'jakie są zwroty i zamówienia indywidualne?',
    });
    expect(returns.text).toContain(KAZKA_RETURNS_FACT);
    expect(returns.text).not.toMatch(/nie przyjmujemy/i);

    const shipping = guardStoreFacts('Naszyjnik Iluzja od 2891 zł do 6706 zł.', 'kazka', {
      userMessage: 'ile kosztuje wysyłka?',
    });
    expect(shipping.text).toBe(KAZKA_SHIPPING_FACT);
    expect(shipping.text).not.toMatch(/iluzja/i);
  });

  it('does not reuse the previous sapphire list after a metal or purity change', async () => {
    const sapphire = shopNode({
      handle: 'zloty-pierscionek-z-naturalnym-szafirem',
      title: 'Złoty pierścionek z naturalnym szafirem',
      description: 'Szafir.',
      vendor: 'EPIR',
      tags: ['szafir'],
      stone: 'szafir',
      sizes: ['12'],
      priceFor: () => '1200.00',
    });
    const fetchMock = vi.fn(async () => adminResponse([sapphire]));
    vi.stubGlobal('fetch', fetchMock);
    const seeded = await seedBuyerTurnContext({
      env: {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'token'},
      brand: 'epir',
      buyerTurns: ['cos z szafirem', 'a 925 czy 585?'],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(seeded.lines.join('\n')).not.toContain('zloty-pierscionek-z-naturalnym-szafirem');

    const guarded = guardBuyerCatalogReply(
      'Zostają te szafiry: [pierścionek](https://epirbizuteria.pl/products/zloty-pierscionek-z-naturalnym-szafirem).',
      {buyerTurns: ['cos z szafirem', 'a 925 czy 585?'], catalogSnapshots: []},
    );
    expect(guarded.replaced).toBe(true);
    expect(guarded.reason).toBe('stale_product_context');
    expect(guarded.text).toBe(STALE_PRODUCT_CONTEXT_REPLY);
    expect(guarded.text).not.toContain('szafir');
  });

  it('asserts EPIR gold free shipping only when that fact exists', () => {
    expect(EPIR_GOLD_FREE_SHIPPING_FACT).toBe('');
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('Złoto: darmowa, ubezpieczona dostawa');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('Przyjmujemy zamówienia indywidualne');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('nie przyjmuje zwrotów ani zamówień indywidualnych');

    const dropped = guardStoreFacts('Złoto bezpłatnie.', 'epir');
    expect(dropped.replaced).toBe(true);
    expect(dropped.text).toBe(EPIR_SHIPPING_FACT);
    expect(dropped.text).not.toMatch(/złot/i);
    expect(dropped.text).not.toMatch(/bezpłat/i);

    const grounded = guardStoreFacts('Złoto bezpłatnie.', 'epir', {
      goldFreeShippingFact: 'Złoto: darmowa, ubezpieczona dostawa.',
    });
    expect(grounded.text).toContain('Złoto: darmowa, ubezpieczona dostawa.');
  });

  it('commits a buyer reply as persist, then delta, then done, and skips an empty turn', () => {
    expect(planBuyerReplyFrames('')).toEqual([]);
    expect(planBuyerReplyFrames('   ')).toEqual([]);
    const frames = planBuyerReplyFrames('  Wysyłka Kazka.  ');
    expect(frames.map((frame) => frame.kind)).toEqual(['persist', 'delta', 'done']);
    expect(frames[0]).toEqual({kind: 'persist', text: 'Wysyłka Kazka.'});
    expect(frames[1]).toEqual({kind: 'delta', text: 'Wysyłka Kazka.'});
    const doneIndex = frames.findIndex((frame) => frame.kind === 'done');
    const persistIndex = frames.findIndex((frame) => frame.kind === 'persist');
    const deltaIndex = frames.findIndex((frame) => frame.kind === 'delta');
    expect(persistIndex).toBeLessThan(deltaIndex);
    expect(deltaIndex).toBeLessThan(doneIndex);
  });
});
