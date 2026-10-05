import {describe, expect, it, vi, afterEach} from 'vitest';
import {guardDiscoveryFromPrice, buyerAsksAboutPageProduct} from '../src/catalog/page-product-card';
import {seedBuyerTurnContext} from '../src/catalog/turn-seed';
import {
  guardStoreFacts,
  KAZKA_RETURNS_FACT,
  KAZKA_SHIPPING_FACT,
  promotionRulesForBrand,
} from '../src/catalog/store-facts';
import {guardSizeQuestionReply, SIZE_GUIDANCE_REPLY} from '../src/intent/size-table';
import {formatPlnMajorForDisplay} from '../src/mcp/catalog-price-enrich';
import {presentCatalogForModel} from '../src/mcp/catalog-for-model';
import {mapAdminKazkaProductToHydrate} from '../src/graphql';
import {formatKazkaCollectionContext} from '../src/storefront/kazka-hydrate';
import {KAZKA_HEADLESS_PERSONA_ADDON} from '../src/prompts/luxury-system-prompt';

describe('P0quater Kazka shipping, returns, size, and from-price', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('grounds Kazka shipping at free above 500 PLN and does not claim missing data or the 15 zł line', () => {
    expect(KAZKA_SHIPPING_FACT).toMatch(/500 zł/);
    expect(KAZKA_SHIPPING_FACT).not.toMatch(/15 zł/);
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('darmowa dla zamówień powyżej 500 zł');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).not.toContain('nie używaj progu 500 zł');

    const missing = guardStoreFacts('Nie posiadam aktualnych danych.', 'kazka', {
      userMessage: 'ile kosztuje wysyłka?',
    });
    expect(missing.replaced).toBe(true);
    expect(missing.text).toContain(KAZKA_SHIPPING_FACT);
    expect(missing.text).not.toMatch(/nie posiadam/i);

    const fifteen = guardStoreFacts('Wysyłka 15 zł, darmowa od 500 zł.', 'kazka');
    expect(fifteen.text).toBe(KAZKA_SHIPPING_FACT);
    expect(fifteen.text).not.toMatch(/15 zł/);

    const kept = guardStoreFacts('Darmowa wysyłka powyżej 500 zł.', 'kazka');
    expect(kept.replaced).toBe(false);
    expect(kept.text).toMatch(/500 zł/);

    expect(promotionRulesForBrand('Free shipping over 500 PLN', 'kazka')).toContain('500');
    expect(promotionRulesForBrand('Wysyłka 15 zł.', 'kazka')).toBe('');
  });

  it('states the 14-day withdrawal for standard goods and withholds an ungrounded free size change', () => {
    expect(KAZKA_RETURNS_FACT).toMatch(/14 dni/);
    expect(KAZKA_RETURNS_FACT).toMatch(/na zamówienie/);
    expect(KAZKA_RETURNS_FACT).not.toMatch(/zmian\p{L}*\s+rozmiaru/iu);
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('Nie obiecuj darmowej zmiany rozmiaru');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).not.toContain('jedna darmowa zmiana rozmiaru');

    const wrong = guardStoreFacts(
      'Zwrot standardowego produktu nie obowiązuje. Jedna darmowa zmiana rozmiaru.',
      'kazka',
      {userMessage: 'jakie są zwroty?'},
    );
    expect(wrong.text).toContain(KAZKA_RETURNS_FACT);
    expect(wrong.text).not.toMatch(/nie obowiązuje/i);
    expect(wrong.text).not.toMatch(/zmian\p{L}*\s+rozmiaru/iu);

    const kept = guardStoreFacts(
      'Standardowy produkt: odstąpienie od umowy w ciągu 14 dni od otrzymania.',
      'kazka',
    );
    expect(kept.replaced).toBe(false);
    expect(kept.text).toMatch(/14 dni/);
  });

  it('answers a size question with measurement guidance and does not dump the Soliter card', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', {status: 500}));
    vi.stubGlobal('fetch', fetchMock);
    const seeded = await seedBuyerTurnContext({
      env: {SHOP_DOMAIN: 'shop.example', SHOPIFY_ADMIN_TOKEN: 'token'},
      brand: 'kazka',
      productHandle: 'soliter',
      buyerTurns: ['jak dobrać rozmiar pierścionka?'],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(seeded.aboutPageProduct).toBe(false);
    expect(seeded.pageCard).toBeNull();
    expect(seeded.lines.join('\n')).toMatch(/obwód palca/i);
    expect(seeded.lines.join('\n')).not.toContain('soliter');
    expect(buyerAsksAboutPageProduct('jak dobrać rozmiar pierścionka?')).toBe(false);
    expect(buyerAsksAboutPageProduct('ile kosztuje ta obrączka i jakie rozmiary')).toBe(true);

    const dumped = guardSizeQuestionReply(
      `Pierścionek Soliter — od ${formatPlnMajorForDisplay(3985)} do ${formatPlnMajorForDisplay(5710)}, metale żółte złoto, rozmiary 7–29.`,
    );
    expect(dumped.replaced).toBe(true);
    expect(dumped.text).toBe(SIZE_GUIDANCE_REPLY);
    expect(dumped.text).not.toMatch(/zł/);
    expect(dumped.text).not.toMatch(/soliter/i);

    const guidance = guardSizeQuestionReply('Zmierz obwód palca i porównaj z tabelą rozmiarów.');
    expect(guidance.replaced).toBe(false);
  });

  it('quotes the live card minimum, not the first higher variant', () => {
    const listed = formatKazkaCollectionContext(
      {handle: 'pierscionki', title: 'Pierścionki'},
      [
        {
          id: 'gid://shopify/Product/soliter',
          handle: 'soliter',
          title: 'Pierścionek Soliter',
          variants: {
            nodes: [
              {
                id: 'v-high',
                title: '14 / żółte złoto',
                availableForSale: true,
                price: {amount: '4202.55', currencyCode: 'PLN'},
              },
            ],
          },
          priceRange: {
            minVariantPrice: {amount: '3985.00', currencyCode: 'PLN'},
            maxVariantPrice: {amount: '5710.00', currencyCode: 'PLN'},
          },
        },
      ],
    );
    expect(listed).toContain(`od ${formatPlnMajorForDisplay(3985)}`);
    expect(listed).not.toContain('4202');
    expect(listed).not.toContain('4 202');

    const fromAdmin = mapAdminKazkaProductToHydrate({
      id: 'gid://shopify/Product/soliter',
      handle: 'soliter',
      title: 'Pierścionek Soliter',
      status: 'ACTIVE',
      variants: {
        nodes: [
          {id: 'v-high', title: '14', availableForSale: true, price: '4202.55'},
          {id: 'v-low', title: '7', availableForSale: true, price: '4500.00'},
        ],
      },
      priceRangeV2: {
        minVariantPrice: {amount: '3985.00', currencyCode: 'PLN'},
        maxVariantPrice: {amount: '5710.00', currencyCode: 'PLN'},
      },
    });
    expect(fromAdmin.priceRange?.minVariantPrice?.amount).toBe('3985.00');
    const adminLine = formatKazkaCollectionContext(
      {handle: 'pierscionki', title: 'Pierścionki'},
      [fromAdmin],
    );
    expect(adminLine).toContain(`od ${formatPlnMajorForDisplay(3985)}`);
    expect(adminLine).not.toContain('4 202');

    const presented = presentCatalogForModel(
      {
        products: [
          {
            id: 'gid://shopify/Product/soliter',
            title: 'Pierścionek Soliter',
            handle: 'soliter',
            vendor: 'Kazka',
            tags: ['kazka'],
            priceRange: {
              minVariantPrice: {amount: '3985.00', currencyCode: 'PLN'},
              maxVariantPrice: {amount: '5710.00', currencyCode: 'PLN'},
            },
            variants: [
              {
                id: 'gid://shopify/ProductVariant/1',
                title: '14',
                price: {amount: '4202.55', currencyCode: 'PLN'},
              },
            ],
          },
        ],
      },
      {brand: 'kazka'},
    );
    const text = (presented as {content?: Array<{text?: string}>}).content?.[0]?.text ?? '';
    const card = (JSON.parse(text) as {products: Array<Record<string, unknown>>}).products[0]!;
    expect(card.price_min_display_pl).toBe(formatPlnMajorForDisplay(3985));
    expect(card.price_max_display_pl).toBe(formatPlnMajorForDisplay(5710));
    expect(card.page_price_display_pl).toBe(`od ${formatPlnMajorForDisplay(3985)}`);

    const quoted = guardDiscoveryFromPrice(
      `Polecam Pierścionek Soliter od ${formatPlnMajorForDisplay(4202.55)}.`,
      [card],
    );
    expect(quoted.replaced).toBe(true);
    expect(quoted.reason).toBe('from_price');
    expect(quoted.text).toContain(formatPlnMajorForDisplay(3985));
    expect(quoted.text).not.toContain(formatPlnMajorForDisplay(4202.55));
  });
});
