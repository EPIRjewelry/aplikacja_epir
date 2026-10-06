import {describe, expect, it} from 'vitest';
import {BuyerTurnGate} from '../src/catalog/buyer-turn-gate';
import {formatCatalogBrowseReply} from '../src/catalog/buyer-reply-guard';
import {groundedTurnReply, replyOrStall} from '../src/catalog/grounded-turn';
import {guardDiscoveryFromPrice} from '../src/catalog/page-product-card';
import {mapStoreProduct} from '../src/catalog/stone-retrieval';
import {
  EPIR_SHIPPING_FACT,
  KAZKA_RETURNS_FACT,
  KAZKA_SHIPPING_FACT,
} from '../src/catalog/store-facts';
import {SIZE_GUIDANCE_REPLY} from '../src/intent/size-table';
import {formatPlnMajorForDisplay} from '../src/mcp/catalog-price-enrich';
import {presentCatalogForModel} from '../src/mcp/catalog-for-model';
import {LUXURY_SYSTEM_PROMPT} from '../src/prompts/luxury-system-prompt';

const CARD_MIN = 3985;
const FIRST_VARIANT = 4202.55;
const PAGE_ONLY_MAX = 5635.4;
const CARD_MAX = 5710;

function soliterDiscoveryCard(): Record<string, unknown> {
  const mapped = mapStoreProduct({
    id: 'gid://shopify/Product/soliter',
    handle: 'soliter',
    title: 'Pierścionek Soliter',
    vendor: 'Kazka',
    tags: ['kazka'],
    options: [
      {name: 'Próba', optionValues: [{name: '585'}, {name: '750'}]},
      {name: 'Metal', optionValues: [{name: 'żółte złoto'}, {name: 'białe złoto'}]},
      {name: 'Kamień', optionValues: [{name: 'brylant 0,10 ct'}, {name: 'brylant 0,25 ct'}]},
    ],
    priceRangeV2: {
      minVariantPrice: {amount: '3985.00', currencyCode: 'PLN'},
      maxVariantPrice: {amount: '5710.00', currencyCode: 'PLN'},
    },
    variants: {
      nodes: [
        {
          id: 'gid://shopify/ProductVariant/750',
          title: '750 / białe złoto / brylant 0,25 ct',
          availableForSale: true,
          price: '4202.55',
          selectedOptions: [
            {name: 'Próba', value: '750'},
            {name: 'Metal', value: 'białe złoto'},
            {name: 'Kamień', value: 'brylant 0,25 ct'},
          ],
        },
        {
          id: 'gid://shopify/ProductVariant/high',
          title: '750 / białe złoto / brylant 0,50 ct',
          availableForSale: true,
          price: '5635.40',
          selectedOptions: [
            {name: 'Próba', value: '750'},
            {name: 'Metal', value: 'białe złoto'},
            {name: 'Kamień', value: 'brylant 0,50 ct'},
          ],
        },
      ],
    },
  });
  const presented = presentCatalogForModel({products: [mapped]}, {brand: 'kazka'});
  const text = (presented as {content?: Array<{text?: string}>}).content?.[0]?.text ?? '{}';
  return (JSON.parse(text) as {products: Array<Record<string, unknown>>}).products[0]!;
}

describe('P0quin Soliter discovery asks which variant', () => {
  it('maps 4202.55 to the first listed 750 variant and 3985 to the full-card minimum', () => {
    const card = soliterDiscoveryCard();
    const variants = card.variants as Array<Record<string, unknown>>;
    const first = variants.find((variant) => variant.price_display_pl === formatPlnMajorForDisplay(FIRST_VARIANT));
    expect(first?.options).toEqual([
      {name: 'Próba', value: '750'},
      {name: 'Metal', value: 'białe złoto'},
      {name: 'Kamień', value: 'brylant 0,25 ct'},
    ]);
    expect(card.price_min_display_pl).toBe(formatPlnMajorForDisplay(CARD_MIN));
    expect(card.price_max_display_pl).toBe(formatPlnMajorForDisplay(CARD_MAX));
    expect(card.price_min_display_pl).not.toBe(formatPlnMajorForDisplay(FIRST_VARIANT));
    expect(card.price_max_display_pl).not.toBe(formatPlnMajorForDisplay(PAGE_ONLY_MAX));
  });

  it('does not lead discovery with od 3985 or od 4202.55', () => {
    const card = soliterDiscoveryCard();
    const fromFirst = guardDiscoveryFromPrice(
      `Polecam Pierścionek Soliter od ${formatPlnMajorForDisplay(FIRST_VARIANT)} (${formatPlnMajorForDisplay(FIRST_VARIANT)}–${formatPlnMajorForDisplay(PAGE_ONLY_MAX)}).`,
      [card],
    );
    expect(fromFirst.replaced).toBe(true);
    expect(fromFirst.reason).toBe('variant_choice');
    expect(fromFirst.text).not.toMatch(/\bod\s+\d/iu);
    expect(fromFirst.text).not.toContain(formatPlnMajorForDisplay(FIRST_VARIANT));
    expect(fromFirst.text).not.toContain(formatPlnMajorForDisplay(PAGE_ONLY_MAX));
    expect(fromFirst.text).toContain(`ceny ${formatPlnMajorForDisplay(CARD_MIN)} – ${formatPlnMajorForDisplay(CARD_MAX)}`);
    expect(fromFirst.text).toMatch(/warianty różnią się metalem, próbą albo wykończeniem/iu);
    expect(fromFirst.text).toMatch(/próby 585, 750/iu);
    expect(fromFirst.text).toMatch(/Który wariant Cię interesuje/iu);

    const fromMin = guardDiscoveryFromPrice(
      `Soliter od ${formatPlnMajorForDisplay(CARD_MIN)}.`,
      [card],
    );
    expect(fromMin.replaced).toBe(true);
    expect(fromMin.text).not.toMatch(/\bod\s+\d/iu);
    expect(fromMin.text).toMatch(/Który wariant/iu);

    const kept = guardDiscoveryFromPrice(
      `Pierścionek Soliter: warianty różnią się metalem, próbą albo kamieniem. Zakres karty ${formatPlnMajorForDisplay(CARD_MIN)}–${formatPlnMajorForDisplay(CARD_MAX)}. Który wariant Cię interesuje?`,
      [card],
    );
    expect(kept.replaced).toBe(false);

    const listed = formatCatalogBrowseReply([card]);
    expect(listed.startsWith('od ')).toBe(false);
    expect(listed).not.toMatch(/\bod\s+\d/iu);
    expect(LUXURY_SYSTEM_PROMPT).toContain('nie zaczynaj od „od X zł”');
    expect(LUXURY_SYSTEM_PROMPT).toContain('który wariant klient chce');
  });
});

describe('P0quin size and returns stay on their own turn', () => {
  it('answers size with measurement guidance and returns with the 14-day fact', () => {
    const size = groundedTurnReply('jak dobrać rozmiar pierścionka?', 'kazka');
    const returns = groundedTurnReply('jakie są zwroty?', 'kazka');
    const shipping = groundedTurnReply('ile kosztuje wysyłka?', 'kazka');
    expect(size).toBe(SIZE_GUIDANCE_REPLY);
    expect(size).toMatch(/obwodu palca/iu);
    expect(size).not.toMatch(/zł|soliter|chwilowo/iu);
    expect(returns).toBe(KAZKA_RETURNS_FACT);
    expect(returns).toMatch(/14 dni/);
    expect(returns).toMatch(/na zamówienie/);
    expect(returns).not.toMatch(/zmian\p{L}*\s+rozmiaru/iu);
    expect(returns).not.toMatch(/chwilowo/iu);
    expect(shipping).toBe(KAZKA_SHIPPING_FACT);
    expect(shipping).toMatch(/500 zł/);
    expect(shipping).not.toMatch(/15 zł/);

    expect(replyOrStall('jak dobrać rozmiar pierścionka?', 'kazka', 'error')).toBe(SIZE_GUIDANCE_REPLY);
    expect(replyOrStall('jakie są zwroty?', 'kazka', 'error')).toBe(KAZKA_RETURNS_FACT);
    expect(replyOrStall('pokaz pierścionki', 'kazka', 'error')).toMatch(/chwilowo nie mogę dokończyć/);

    const turns = [
      {question: 'jakie są zwroty?', reply: groundedTurnReply('jakie są zwroty?', 'kazka')},
      {question: 'jak dobrać rozmiar pierścionka?', reply: groundedTurnReply('jak dobrać rozmiar pierścionka?', 'kazka')},
    ];
    expect(turns[0]?.reply).toMatch(/14 dni/);
    expect(turns[0]?.reply).not.toMatch(/obwodu palca/iu);
    expect(turns[1]?.reply).toMatch(/obwodu palca/iu);
    expect(turns[1]?.reply).not.toMatch(/14 dni/);
    expect(turns[0]?.reply).not.toBe(turns[1]?.reply);
  });

  it('keeps the EPIR silver shipping fact', () => {
    expect(groundedTurnReply('ile kosztuje wysyłka?', 'epir')).toBe(EPIR_SHIPPING_FACT);
    expect(groundedTurnReply('ile kosztuje wysyłka?', 'epir')).not.toBe(KAZKA_SHIPPING_FACT);
  });

  it('holds the next buyer turn until the previous one ends', async () => {
    const gate = new BuyerTurnGate(200);
    const order: string[] = [];
    const first = gate.begin('returns').then(async () => {
      order.push('returns-start');
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push('returns-end');
      gate.end('returns');
    });
    const second = gate.begin('size').then(() => {
      order.push('size-start');
      gate.end('size');
    });
    await Promise.all([first, second]);
    expect(order).toEqual(['returns-start', 'returns-end', 'size-start']);
  });
});
