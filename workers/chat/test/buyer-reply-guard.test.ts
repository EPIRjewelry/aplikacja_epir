import {describe, expect, it} from 'vitest';
import {guardBuyerCatalogReply, isGarbledBuyerText} from '../src/catalog/buyer-reply-guard';

const SAPPHIRE = {
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        products: [
          {
            title: 'Srebrna obrączka z szafirem syntetycznym',
            handle: 'obraczka-z-szafirem-epir-jewellery',
            url: 'https://epirbizuteria.pl/products/obraczka-z-szafirem-epir-jewellery',
            price_display_pl: '310 zł',
            price_is_flat: true,
          },
          {
            title: 'Złoty pierścionek z naturalnym szafirem',
            handle: 'zloty-pierscionek-z-naturalnym-szafirem',
            url: 'https://epirbizuteria.pl/products/zloty-pierscionek-z-naturalnym-szafirem',
            price_display_pl: '1200 zł',
          },
        ],
      }),
    },
  ],
};

describe('guardBuyerCatalogReply', () => {
  it('replaces a false empty and a silent tourmaline pitch with the sapphire cards', () => {
    const turns = ['cos z szafirem', 'pokaz kilka pozycji'];
    const denied = guardBuyerCatalogReply(
      'W ofercie nie ma produktów opisanych wyłącznie jako „szafir”.',
      {buyerTurns: turns, catalogSnapshots: [SAPPHIRE]},
    );
    expect(denied.replaced).toBe(true);
    expect(denied.reason).toBe('false_empty');
    expect(denied.text).toContain('obraczka-z-szafirem-epir-jewellery');
    expect(denied.text).toContain('310 zł');
    expect(denied.text).not.toContain('turmalin');

    const swapped = guardBuyerCatalogReply(
      'Polecę pierścionek z czarnym turmalinem z kolekcji Gałązki, 280 zł. Czy dodać do koszyka?',
      {buyerTurns: ['cos z szafirem', 'ring'], catalogSnapshots: [SAPPHIRE]},
    );
    expect(swapped.reason).toBe('substitute');
    expect(swapped.text).toContain('https://epirbizuteria.pl/products/obraczka-z-szafirem-epir-jewellery');
    expect(swapped.text).not.toContain('turmalin');
  });

  it('keeps a reply that already cites the sapphire card', () => {
    const reply =
      'Mam [obrączkę z szafirem](https://epirbizuteria.pl/products/obraczka-z-szafirem-epir-jewellery), 310 zł.';
    const guarded = guardBuyerCatalogReply(reply, {
      buyerTurns: ['szafir', 'pokaz kilka'],
      catalogSnapshots: [SAPPHIRE],
    });
    expect(guarded.replaced).toBe(false);
    expect(guarded.text).toBe(reply);
  });

  it('asks before offering another stone only after a confirmed miss', () => {
    const unconfirmed = guardBuyerCatalogReply('Polecę czarny turmalin, 280 zł.', {
      buyerTurns: ['szafir'],
      catalogSnapshots: [],
    });
    expect(unconfirmed.text).not.toContain('Nie mam teraz w ofercie');
    expect(unconfirmed.text).toContain('Jeszcze nie potwierdziłam');
    expect(unconfirmed.text).not.toContain('280');

    const guarded = guardBuyerCatalogReply('Polecę czarny turmalin, 280 zł.', {
      buyerTurns: ['szafir'],
      catalogSnapshots: [],
      stoneLookup: 'confirmed_miss',
    });
    expect(guarded.text).toContain('Nie mam teraz w ofercie kamienia „szafir”');
    expect(guarded.text).not.toContain('280');
  });

  it('surfaces sapphire cards on the first stone turn, before „pokaż kilka”', () => {
    const guarded = guardBuyerCatalogReply('Nie mam teraz w ofercie kamienia szafir.', {
      buyerTurns: ['cos z szafirem'],
      catalogSnapshots: [SAPPHIRE],
      stoneLookup: 'hit',
    });
    expect(guarded.replaced).toBe(true);
    expect(guarded.reason).toBe('false_empty');
    expect(guarded.text).toContain('obraczka-z-szafirem-epir-jewellery');
    expect(guarded.text).toContain('zloty-pierscionek-z-naturalnym-szafirem');
    expect(guarded.text).toContain('310 zł');
    expect(guarded.text).not.toContain('Nie mam teraz w ofercie');
  });

  it('treats a repeated token as garbled and does not leave it in the reply', () => {
    expect(isGarbledBuyerText('Niestety w ofercie EPEPPE ?')).toBe(true);
    expect(isGarbledBuyerText('pierpiercików z szszsz')).toBe(true);
    const guarded = guardBuyerCatalogReply('Łączę z asystentem…', {
      buyerTurns: ['szafir'],
      catalogSnapshots: [SAPPHIRE],
    });
    expect(guarded.reason).toBe('garbled');
    expect(guarded.text).toContain('szafir');
    expect(guarded.text).not.toContain('Łączę');
  });
});
