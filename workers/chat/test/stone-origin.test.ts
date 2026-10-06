import {describe, expect, it} from 'vitest';
import {guardBuyerCatalogReply} from '../src/catalog/buyer-reply-guard';
import {detectPolicyInformationIntent} from '../src/intent/policy-information';
import {presentCatalogForModel} from '../src/mcp/catalog-for-model';
import {mapStoreProduct} from '../src/catalog/stone-retrieval';
import {detectStoneIntent} from '../src/catalog/stone-intent';
import {
  kazkaQualityKind,
  cardStoneOrigin,
  detectStoneOriginAsk,
  filterProductsByOriginAsk,
  formatOriginAssortmentReply,
  guardStoneOriginClaims,
  isCertificateQuestion,
  isRepeatedAssistantReply,
  isStoneOriginAssortmentQuestion,
  latestTurnSearchHints,
  productMatchesOriginAsk,
} from '../src/catalog/stone-origin';
import {LUXURY_SYSTEM_PROMPT, KAZKA_HEADLESS_PERSONA_ADDON} from '../src/prompts/luxury-system-prompt';

function snapshot(products: unknown[]) {
  return {content: [{type: 'text', text: JSON.stringify({products})}]};
}

const SYNTH_BAND = {
  title: 'Srebrna obrączka z szafirem syntetycznym',
  handle: 'obraczka-z-szafirem-epir-jewellery',
  url: 'https://epirbizuteria.pl/products/obraczka-z-szafirem-epir-jewellery',
  description: 'Obrączka, szafir syntetyczny.',
  price_display_pl: '310 zł',
  price_is_flat: true,
};

const NATURAL_GOLD = {
  title: 'Złoty pierścionek z naturalnym szafirem',
  handle: 'zloty-pierscionek-z-naturalnym-szafirem',
  url: 'https://epirbizuteria.pl/products/zloty-pierscionek-z-naturalnym-szafirem',
  description: 'Naturalny szafir, złoto.',
  price_display_pl: '2870 zł',
  price_is_flat: true,
};

const FALE_WODY = {
  title: 'Pierścionek srebrny fale wody z szafirem',
  handle: 'pierscionek-srebrny-fale-wody-z-szafirem',
  url: 'https://epirbizuteria.pl/products/pierscionek-srebrny-fale-wody-z-szafirem',
  price_display_pl: '890 zł',
  price_is_flat: true,
};

describe('stone origin intent', () => {
  it('reads natural / lab with missing diacritics and typos', () => {
    expect(detectStoneOriginAsk('naturalny szafir')).toBe('natural');
    expect(detectStoneOriginAsk('nateralny szafir')).toBe('natural');
    expect(detectStoneOriginAsk('z kopalni')).toBe('natural');
    expect(detectStoneOriginAsk('syntetyczny')).toBe('lab');
    expect(detectStoneOriginAsk('syntetczny')).toBe('lab');
    expect(detectStoneOriginAsk('laboratoryjny lab')).toBe('lab');
    expect(detectStoneOriginAsk('hodowany')).toBe('lab');
    expect(detectStoneOriginAsk('sztuczny')).toBe('lab');
    expect(isStoneOriginAssortmentQuestion('uzywacie naturalnych?')).toBe(true);
    expect(isStoneOriginAssortmentQuestion('czy macie kamienie naturalne?')).toBe(true);
    expect(isCertificateQuestion('Czy kamienie są certyfikowane?')).toBe(true);
    expect(detectPolicyInformationIntent('Czy kamienie są certyfikowane?').match).toBe(true);
    expect(detectStoneIntent('brylancik')?.id).toBe('diament');
  });

  it('classifies the control synthetic band and does not treat it as natural', () => {
    expect(cardStoneOrigin(SYNTH_BAND)).toBe('lab');
    expect(productMatchesOriginAsk(SYNTH_BAND, 'natural')).toBe(false);
    expect(cardStoneOrigin(NATURAL_GOLD)).toBe('natural');
    expect(cardStoneOrigin(FALE_WODY)).toBe('natural');
    expect(filterProductsByOriginAsk([SYNTH_BAND, NATURAL_GOLD, FALE_WODY], 'natural').map((p) => p.handle)).toEqual([
      'zloty-pierscionek-z-naturalnym-szafirem',
      'pierscionek-srebrny-fale-wody-z-szafirem',
    ]);
  });
});

describe('origin and certificate reply guards', () => {
  it('blocks absolute EPIR claims and lists mixed cards from this turn', () => {
    const guarded = guardStoneOriginClaims('Używamy wyłącznie kamieni z naturalnych złóż.', {
      buyerTurns: ['uzywacie naturalnych?'],
      catalogProducts: [SYNTH_BAND, NATURAL_GOLD],
      brand: 'epir',
    });
    expect(guarded.replaced).toBe(true);
    expect(guarded.text).toContain('naturalne i syntetyczne');
    expect(guarded.text).toContain('zloty-pierscionek-z-naturalnym-szafirem');
    expect(guarded.text).toContain('obraczka-z-szafirem-epir-jewellery');
    expect(guarded.text).not.toMatch(/wyłącznie/i);
  });

  it('never returns only synthetics for natural sapphire', () => {
    const guarded = guardBuyerCatalogReply(
      'Polecam [obrączkę](https://epirbizuteria.pl/products/obraczka-z-szafirem-epir-jewellery).',
      {
        buyerTurns: ['naturalny szafir'],
        catalogSnapshots: [snapshot([SYNTH_BAND])],
        brand: 'epir',
        stoneLookup: 'confirmed_miss',
      },
    );
    expect(guarded.replaced).toBe(true);
    expect(guarded.text).toMatch(/naturalnego kamienia „szafir”/i);
    expect(guarded.text).not.toContain('obraczka-z-szafirem-epir-jewellery');
  });

  it('rebuilds after an identical previous reply when the latest turn adds droższy', () => {
    const previous =
      'Polecam [Złoty pierścionek z naturalnym szafirem](https://epirbizuteria.pl/products/zloty-pierscionek-z-naturalnym-szafirem), 2870 zł.';
    expect(isRepeatedAssistantReply(previous, previous)).toBe(true);
    const guarded = guardStoneOriginClaims(previous, {
      buyerTurns: ['szafir', 'droższy'],
      previousAssistant: previous,
      catalogProducts: [NATURAL_GOLD, FALE_WODY],
      brand: 'epir',
    });
    expect(guarded.replaced).toBe(true);
    expect(guarded.reason).toBe('repeat_turn');
    expect(latestTurnSearchHints('fale wody z szafirem?').tokens).toContain('fale wody');
    expect(latestTurnSearchHints('pokaz pierscionek do 6000 zl').priceCapPln).toBe(6000);
  });

  it('filters catalog cards above a buyer price cap', async () => {
    const {applyTurnSearchHints, latestTurnSearchHints} = await import('../src/catalog/stone-origin');
    const kept = applyTurnSearchHints(
      [
        {handle: 'cheap', title: 'A', price_display_pl: '4200 zł'},
        {handle: 'pricey', title: 'B', price_min_display_pl: '7200 zł', price_max_display_pl: '9000 zł'},
      ],
      latestTurnSearchHints('pokaz pierscionek z naturalnym diamentem do 6000 zl'),
    );
    expect(kept.map((product) => product.handle)).toEqual(['cheap']);
  });

  it('does not put a miss template for a random stone on a ruby card', () => {
    const ruby = {
      title: 'Pierścionek z rubinem',
      handle: 'rubin-karta',
      url: 'https://epirbizuteria.pl/products/rubin-karta',
      price_display_pl: '900 zł',
    };
    const guarded = guardBuyerCatalogReply('Nie mam teraz w ofercie kamienia „diament”.', {
      buyerTurns: ['pokaż ten rubin'],
      catalogSnapshots: [snapshot([ruby])],
      stoneLookup: 'hit',
    });
    expect(guarded.text).not.toContain('Nie mam teraz w ofercie kamienia „diament”');
    expect(guarded.text).toContain('rubin-karta');
  });

  it('sends certificate questions to the unknown-card template instead of a product fallback', () => {
    const bracelet = {
      title: 'Bransoletka srebrna',
      handle: 'bransoletka-srebrna',
      url: 'https://epirbizuteria.pl/products/bransoletka-srebrna',
      price_display_pl: '420 zł',
    };
    const guarded = guardBuyerCatalogReply(
      'Każdy kamień jest certyfikowany. Zobacz [bransoletkę](https://epirbizuteria.pl/products/bransoletka-srebrna).',
      {
        buyerTurns: ['czy kamienie sa certyfikowane?'],
        catalogSnapshots: [snapshot([bracelet])],
        brand: 'epir',
      },
    );
    expect(guarded.replaced).toBe(true);
    expect(guarded.text).toContain('proszę o kontakt z pracownią');
    expect(guarded.text).not.toContain('bransoletka-srebrna');
    expect(guarded.text).not.toMatch(/każdy kamień jest certyfikowany/i);
  });
});

describe('Kazka Jakość price groups', () => {
  it('aggregates natural vs LAB from real variants and keeps the variant question', () => {
    const mapped = mapStoreProduct({
      id: 'gid://shopify/Product/soliter-101',
      handle: 'soliter',
      title: 'Pierścionek Soliter',
      vendor: 'Kazka',
      tags: ['kazka'],
      sku: '101-10010-3-7',
      options: [
        {name: 'Jakość', optionValues: [{name: 'G/VS2'}, {name: 'LAB'}]},
        {name: 'Rozmiar', optionValues: [{name: '12'}, {name: '14'}]},
      ],
      variants: {
        nodes: [
          {
            id: 'gid://shopify/ProductVariant/n1',
            title: 'G/VS2 / 12',
            price: '6400.00',
            selectedOptions: [
              {name: 'Jakość', value: 'G/VS2'},
              {name: 'Rozmiar', value: '12'},
            ],
          },
          {
            id: 'gid://shopify/ProductVariant/n2',
            title: 'G/VS2 / 14',
            price: '6800.00',
            selectedOptions: [
              {name: 'Jakość', value: 'G/VS2'},
              {name: 'Rozmiar', value: '14'},
            ],
          },
          {
            id: 'gid://shopify/ProductVariant/l1',
            title: 'LAB / 12',
            price: '4200.00',
            selectedOptions: [
              {name: 'Jakość', value: 'LAB'},
              {name: 'Rozmiar', value: '12'},
            ],
          },
          {
            id: 'gid://shopify/ProductVariant/l2',
            title: 'LAB / 14',
            price: '4500.00',
            selectedOptions: [
              {name: 'Jakość', value: 'LAB'},
              {name: 'Rozmiar', value: '14'},
            ],
          },
        ],
      },
    });
    const presented = presentCatalogForModel({products: [mapped]}, {brand: 'kazka'});
    const text = (presented as {content?: Array<{text?: string}>}).content?.[0]?.text ?? '{}';
    const card = (JSON.parse(text) as {products: Array<Record<string, unknown>>}).products[0]!;
    const groups = card.quality_price_groups as Array<Record<string, string>>;
    expect(groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({kind: 'natural', price_min_display_pl: '6400 zł', price_max_display_pl: '6800 zł'}),
        expect.objectContaining({kind: 'lab', price_min_display_pl: '4200 zł', price_max_display_pl: '4500 zł'}),
      ]),
    );
    expect(card.price_is_flat).toBe(false);
    expect(JSON.stringify(presented)).toContain('który wariant klient chce');
    expect(kazkaQualityKind('G/VS2')).toBe('natural');
    expect(kazkaQualityKind('LAB')).toBe('lab');
    expect(cardStoneOrigin(mapped)).toBe('mixed');
  });

  it('treats Big Lab as lab-only', () => {
    expect(cardStoneOrigin({handle: 'big-lab-soliter', title: 'Big Lab Soliter', tags: ['kazka', 'big-lab']})).toBe(
      'lab',
    );
    expect(formatOriginAssortmentReply([], 'kazka')).toContain('opcji Jakość');
    expect(KAZKA_HEADLESS_PERSONA_ADDON).toContain('Jakość');
    expect(LUXURY_SYSTEM_PROMPT).toContain('Pochodzenie kamienia');
    expect(LUXURY_SYSTEM_PROMPT).toContain('brylancik');
  });
});
