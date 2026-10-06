import {describe, expect, it} from 'vitest';
import {
  buyerAllowsStoneSubstitute,
  buyerAsksForRing,
  buyerAsksForWeddingBand,
  detectNamedBrowseQuery,
  detectStoneIntent,
  discoveryMetalBrowse,
  expandCatalogQuery,
  namedBrowseFromConversation,
  preferJewelryType,
  productLooksLikeRing,
  productMatchesDiscoveryMetal,
  rewriteCatalogQueryForDiscoveryMetal,
  stoneIntentFromConversation,
} from '../src/catalog/stone-intent';

describe('detectStoneIntent', () => {
  it('reads Polish inflection and the English name as szafir', () => {
    expect(detectStoneIntent('cos z szafirem')?.id).toBe('szafir');
    expect(detectStoneIntent('ring with sapphire')?.id).toBe('szafir');
    expect(detectStoneIntent('sapphires')?.id).toBe('szafir');
  });

  it('does not lock the catalog when the buyer names two stones', () => {
    expect(detectStoneIntent('szafir albo turmalin')).toBeNull();
  });

  it('keeps the stone from an earlier turn when the latest line only asks to browse', () => {
    const intent = stoneIntentFromConversation(['cos z szafirem', 'pokaz kilka pozycji']);
    expect(intent?.id).toBe('szafir');
  });

  it('drops the prior stone when the buyer names a new product type without a stone', () => {
    expect(stoneIntentFromConversation(['pierścionek z szafirem', 'obrączki'])).toBeNull();
    expect(namedBrowseFromConversation(['pierścionek z szafirem', 'obrączki'])).toBe('obrączka');
  });

  it('switches the stone when the latest line names a different one', () => {
    expect(stoneIntentFromConversation(['szafir', 'a może turmalin'])?.id).toBe('turmalin');
  });

  it('keeps soliter browse when the line does not name a stone', () => {
    expect(detectNamedBrowseQuery('pokaż pierścionek soliter')).toBe('pierścionek soliter');
    expect(detectNamedBrowseQuery('soliter')).toBe('pierścionek soliter');
    expect(detectNamedBrowseQuery('kolczyki soliter')).toBe('kolczyki soliter');
    expect(detectNamedBrowseQuery('obrączki')).toBe('obrączka');
    expect(detectNamedBrowseQuery('bransoletka do 300 zł')).toBe('bransoletka');
    expect(detectNamedBrowseQuery('cos z szafirem')).toBeNull();
    expect(namedBrowseFromConversation(['pierścionki zaręczynowe', 'jaka cena'])).toBe('pierścionek zaręczynowy');
  });
});

describe('buyerAllowsStoneSubstitute', () => {
  it('does not treat słucham, pokaż kilka or ring as consent', () => {
    expect(buyerAllowsStoneSubstitute('słucham', 'Czy mogę zaproponować inny kamień?')).toBe(false);
    expect(buyerAllowsStoneSubstitute('pokaz kilka')).toBe(false);
    expect(buyerAllowsStoneSubstitute('ring')).toBe(false);
    expect(buyerAllowsStoneSubstitute('nie, tylko szafir')).toBe(false);
  });

  it('accepts an explicit ask and a tak after the question', () => {
    expect(buyerAllowsStoneSubstitute('pokaż inny kamień')).toBe(true);
    expect(buyerAllowsStoneSubstitute('tak', 'Czy mogę zaproponować biżuterię z innym kamieniem?')).toBe(true);
  });
});

describe('catalog query and jewelry type', () => {
  it('replaces a query that dropped the stone with both lemmas', () => {
    const intent = detectStoneIntent('szafir')!;
    expect(expandCatalogQuery('czarny turmalin', intent)).toBe('(szafir OR sapphire)');
    expect(expandCatalogQuery('pierścionek szafir', intent)).toBe('pierścionek (szafir OR sapphire)');
  });

  it('narrows ring to a band or a ring and falls back to every stone hit', () => {
    const products = [
      {title: 'Naszyjnik z szafirem', handle: 'naszyjnik-szafir'},
      {title: 'Srebrna obrączka z szafirem', handle: 'obraczka-z-szafirem-epir-jewellery'},
    ];
    expect(preferJewelryType(products, 'ring with sapphire').map((product) => product.handle)).toEqual([
      'obraczka-z-szafirem-epir-jewellery',
    ]);
    expect(preferJewelryType(products, 'cos z szafirem')).toHaveLength(2);
    expect(preferJewelryType([{title: 'Naszyjnik Iluzja', handle: 'naszyjnik-iluzja'}], 'pierścionek zaręczynowy')).toEqual(
      [],
    );
  });

  it('keeps finger Soliter rings and drops Soliter earrings; obrączki stay bands', () => {
    expect(productLooksLikeRing({title: 'Kolczyki Soliter Motylek', handle: 'kolczyki-soliter'})).toBe(false);
    expect(productLooksLikeRing({title: 'Pierścionek Soliter', handle: '101-10010-3-7'})).toBe(true);
    const pool = [
      {title: 'Kolczyki Soliter Wieczność', handle: 'kolczyki-soliter-wiecznosc'},
      {title: 'Pierścionek Soliter', handle: '101-10010-3-7'},
      {title: 'Pierścionek Soliter klasyczny', handle: '101-10019'},
    ];
    expect(preferJewelryType(pool, 'soliter').map((product) => product.handle)).toEqual([
      '101-10010-3-7',
      '101-10019',
    ]);
    expect(buyerAsksForWeddingBand('obrączki')).toBe(true);
    expect(
      preferJewelryType(
        [
          {title: 'Pierścionek Soliter', handle: '101-10010-3-7'},
          {title: 'Srebrne obrączki ślubne Kora', handle: 'kora'},
        ],
        'obrączki',
      ).map((product) => product.handle),
    ).toEqual(['kora']);
    expect(
      productMatchesDiscoveryMetal(
        {title: 'Srebrne obrączki ślubne', handle: 'kora', tags: ['metal_silver']},
        'złoto',
      ),
    ).toBe(false);
  });

  it('drops a carried stone when the latest turn changes metal or purity', () => {
    expect(stoneIntentFromConversation(['cos z szafirem', '925 czy 585'])).toBeNull();
    expect(namedBrowseFromConversation(['pierścionki zaręczynowe', 'ile kosztuje wysyłka'])).toBeNull();
  });

  it('keeps a classic ring when the next turn is only the metal', () => {
    expect(buyerAsksForRing('szukam piersconka, ale klasycznego')).toBe(true);
    expect(discoveryMetalBrowse(['szukam piersconka, ale klasycznego', 'srebro'])).toEqual({
      metal: 'srebro',
      query: 'pierścionek klasyczny srebro',
    });
    expect(discoveryMetalBrowse(['szukam pierścionka klasycznego', 'złoto'])?.metal).toBe('złoto');
    expect(discoveryMetalBrowse(['szukam pierścionka klasycznego', 'w srebrze'])?.metal).toBe('srebro');
    expect(discoveryMetalBrowse(['cos z szafirem', 'srebro'])).toBeNull();
    expect(discoveryMetalBrowse(['szukam pierścionka klasycznego', 'a 925 czy 585?'])).toBeNull();
    expect(
      rewriteCatalogQueryForDiscoveryMetal('srebro', ['szukam piersconka, ale klasycznego', 'srebro']),
    ).toBe('pierścionek klasyczny srebro');
  });
});
