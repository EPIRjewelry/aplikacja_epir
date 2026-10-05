import {describe, expect, it} from 'vitest';
import {
  buyerAllowsStoneSubstitute,
  detectStoneIntent,
  expandCatalogQuery,
  preferJewelryType,
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

  it('switches the stone when the latest line names a different one', () => {
    expect(stoneIntentFromConversation(['szafir', 'a może turmalin'])?.id).toBe('turmalin');
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
    expect(expandCatalogQuery('czarny turmalin', intent)).toBe('szafir sapphire');
    expect(expandCatalogQuery('pierścionek szafir', intent)).toBe('pierścionek szafir sapphire');
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
  });
});
