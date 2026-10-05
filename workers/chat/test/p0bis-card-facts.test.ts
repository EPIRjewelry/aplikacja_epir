import {afterEach, describe, expect, it, vi} from 'vitest';
import {formatPlnMajorForDisplay} from '../src/mcp/catalog-price-enrich';
import {guardPageProductReply, loadPageProductCard, buyerAsksAboutPageProduct} from '../src/catalog/page-product-card';
import {hydrateThinCatalogCards} from '../src/catalog/stone-retrieval';
import {presentCatalogForModel} from '../src/mcp/catalog-for-model';
import {guardStoreFacts, promotionRulesForBrand, EPIR_SHIPPING_FACT, KAZKA_SHIPPING_FACT, KAZKA_ASSORTMENT_FACT, HARDNESS_FACT} from '../src/catalog/store-facts';
import {seedBuyerTurnContext} from '../src/catalog/turn-seed';

const SHOP = 'epir-art-silver-jewellery.myshopify.com';

function shopNode(input: {
  handle: string;
  title: string;
  description: string;
  vendor: string;
  tags: string[];
  stone?: string;
  sizes: string[];
  priceFor: (size: string) => string;
}) {
  return {
    id: `gid://shopify/Product/${input.handle}`,
    handle: input.handle,
    title: input.title,
    description: input.description,
    vendor: input.vendor,
    tags: input.tags,
    onlineStoreUrl: `https://${SHOP}/products/${input.handle}`,
    options: [{name: 'Rozmiar', optionValues: input.sizes.map((size) => ({name: size}))}],
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

describe('page product card', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('quotes the flat page card instead of „nie znalazłem” and drops a foreign gold price', async () => {
    const sizes = Array.from({length: 23}, (_, index) => String(7 + index));
    const band = shopNode({
      handle: 'szeroka-obraczka-srebro',
      title: 'Szeroka srebrna obrączka',
      description: 'Szeroka obrączka, srebro.',
      vendor: 'EPIR',
      tags: ['srebro'],
      sizes,
      priceFor: () => '260.00',
    });
    vi.stubGlobal('fetch', vi.fn(async () => adminResponse([band])));
    const loaded = await loadPageProductCard(
      {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'token'},
      'szeroka-obraczka-srebro',
      'epir',
    );
    expect(loaded?.card.price_is_flat).toBe(true);
    expect(loaded?.card.price_display_pl).toBe(formatPlnMajorForDisplay(260));
    expect(loaded?.card.sizes_label).toBe('7–29');

    const missing = guardPageProductReply('Nie znalazłem tej szerokiej srebrnej obrączki.', loaded!.card);
    expect(missing.replaced).toBe(true);
    expect(missing.text).toContain(formatPlnMajorForDisplay(260));
    expect(missing.text).toContain('7–29');
    expect(missing.text).toContain('/products/szeroka-obraczka-srebro');

    const mixed = guardPageProductReply('Ta obrączka kosztuje 260 zł, a złota 3990 zł.', loaded!.card);
    expect(mixed.text).toContain(formatPlnMajorForDisplay(260));
    expect(mixed.text).toContain('7–29');
    expect(mixed.text).not.toContain('3990');
  });

  it('quotes Soliter as a range with the full size list, not one mid price', async () => {
    const sizes = Array.from({length: 23}, (_, index) => String(7 + index));
    const soliter = shopNode({
      handle: 'soliter',
      title: 'Pierścionek Soliter',
      description: 'Soliter, brylant, złoto.',
      vendor: 'Kazka',
      tags: ['kazka'],
      stone: 'brylant',
      sizes,
      priceFor: (size) => (size === '14' ? '4929.00' : size === '29' ? '6100.00' : '3985.00'),
    });
    vi.stubGlobal('fetch', vi.fn(async () => adminResponse([soliter])));
    const loaded = await loadPageProductCard(
      {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'token'},
      'soliter',
      'kazka',
    );
    expect(loaded?.card.price_is_flat).toBe(false);
    expect(loaded?.card.price_min_display_pl).toBe(formatPlnMajorForDisplay(3985));
    expect(loaded?.card.price_max_display_pl).toBe(formatPlnMajorForDisplay(6100));
    expect(loaded?.card.sizes_label).toBe('7–29');
    expect(String(loaded?.card.url)).toContain('kazka.epirbizuteria.pl/products/soliter');

    const quoted = guardPageProductReply('Soliter 4929 zł, rozmiary 7–14.', loaded!.card);
    expect(quoted.replaced).toBe(true);
    expect(quoted.text).toContain(formatPlnMajorForDisplay(3985));
    expect(quoted.text).toContain(formatPlnMajorForDisplay(6100));
    expect(quoted.text).toContain('7–29');
    expect(quoted.text).not.toContain('7–14');
  });

  it('treats a stone browse on the product page as not about that one card', () => {
    expect(buyerAsksAboutPageProduct('ile kosztuje ta obrączka i jakie rozmiary')).toBe(true);
    expect(buyerAsksAboutPageProduct('cos z szafirem')).toBe(false);
    expect(buyerAsksAboutPageProduct('ile kosztuje wysyłka')).toBe(false);
  });
});

describe('hydrateThinCatalogCards', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces a one-variant Soliter card with the live min, max, and full sizes', async () => {
    const sizes = Array.from({length: 23}, (_, index) => String(7 + index));
    const full = shopNode({
      handle: 'soliter',
      title: 'Pierścionek Soliter',
      description: 'Soliter.',
      vendor: 'Kazka',
      tags: ['kazka'],
      sizes,
      priceFor: (size) => (size === '29' ? '6100.00' : '3985.00'),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/admin/api/')) return adminResponse([full]);
        return new Response('{}', {status: 500});
      }),
    );
    const thin = {
      products: [
        {
          handle: 'soliter',
          title: 'Pierścionek Soliter',
          vendor: 'Kazka',
          tags: ['kazka'],
          options: [{name: 'Rozmiar', values: ['7', '8', '9', '10', '11', '12', '13', '14']}],
          variants: [{id: 'gid://shopify/ProductVariant/1', title: '14', price: {amount: '4929.00', currencyCode: 'PLN'}}],
        },
      ],
    };
    const hydrated = await hydrateThinCatalogCards(thin, {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'token'});
    const presented = presentCatalogForModel(hydrated, {brand: 'kazka'});
    const text = (presented as {content?: Array<{text?: string}>}).content?.[0]?.text ?? '';
    const card = (JSON.parse(text) as {products: Array<Record<string, unknown>>}).products[0];
    expect(card?.price_is_flat).toBe(false);
    expect(card?.price_min_display_pl).toBe(formatPlnMajorForDisplay(3985));
    expect(card?.price_max_display_pl).toBe(formatPlnMajorForDisplay(6100));
    expect(card?.sizes_label).toBe('7–29');
  });
});

describe('store facts', () => {
  it('keeps the 500 zł threshold on EPIR silver only', () => {
    const loose = guardStoreFacts('Darmowa wysyłka od 500 zł.', 'epir');
    expect(loose.replaced).toBe(true);
    expect(loose.text).toContain(EPIR_SHIPPING_FACT);
    const precise = guardStoreFacts('Srebro: wysyłka 15 zł, darmowa od 500 zł.', 'epir');
    expect(precise.replaced).toBe(false);
    const hard = guardStoreFacts('Srebro jest mniej podatne na zarysowania.', 'epir');
    expect(hard.text).toBe(HARDNESS_FACT);
    expect(hard.text).not.toContain('zarysowania');
  });

  it('does not move EPIR shipping or a silver line onto Kazka', () => {
    const reply = guardStoreFacts(
      'Darmowa wysyłka od 500 zł. Zwrot w 14 dni. Mamy srebrne obrączki Kazka, to nie jest część EPIR.',
      'kazka',
    );
    expect(reply.text).toContain(KAZKA_SHIPPING_FACT);
    expect(reply.text).toContain(KAZKA_ASSORTMENT_FACT);
    expect(reply.text).not.toMatch(/500 zł/);
    expect(reply.text).not.toMatch(/14 dni/);
    expect(reply.text).not.toMatch(/srebrne obrączki/i);
    expect(promotionRulesForBrand('Free shipping over 500 PLN', 'kazka')).toBe('');
    expect(promotionRulesForBrand('Free shipping over 500 PLN', 'epir')).toContain('500');
  });
});

describe('seedBuyerTurnContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts sapphire cards in the first turn, before the buyer asks to see a few', async () => {
    const enamel = shopNode({
      handle: 'emalia-szafir',
      title: 'Pierścionek emalia i szafir',
      description: 'Emalia, szafir.',
      vendor: 'EPIR',
      tags: ['szafir'],
      stone: 'szafir',
      sizes: ['12', '13'],
      priceFor: () => '210.00',
    });
    const opal = shopNode({
      handle: 'opal-szafir',
      title: 'Pierścionek opal i szafir',
      description: 'Opal, szafir.',
      vendor: 'EPIR',
      tags: ['szafir'],
      stone: 'szafir',
      sizes: ['12', '13'],
      priceFor: () => '260.00',
    });
    vi.stubGlobal('fetch', vi.fn(async () => adminResponse([enamel, opal])));
    const seeded = await seedBuyerTurnContext({
      env: {SHOP_DOMAIN: SHOP, SHOPIFY_ADMIN_TOKEN: 'token'},
      brand: 'epir',
      buyerTurns: ['cos z szafirem'],
    });
    expect(seeded.stoneLookup).toBe('hit');
    const blob = seeded.lines.join('\n');
    expect(blob).toContain('emalia-szafir');
    expect(blob).toContain('opal-szafir');
    expect(blob).toContain(formatPlnMajorForDisplay(210));
    expect(blob).toContain(formatPlnMajorForDisplay(260));
    expect(blob).not.toContain('Nie mam teraz w ofercie kamienia');
  });
});
