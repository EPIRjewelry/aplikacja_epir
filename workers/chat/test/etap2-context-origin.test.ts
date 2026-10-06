import {describe, expect, it} from 'vitest';
import {
  applyOriginFilterWithFallback,
  originAskForTurn,
  originCatalogQuery,
} from '../src/catalog/stone-origin';
import {detectStoneIntent, ringRetryQuery, shopifyStoneLemmaGroup, shopifyStoneQuery} from '../src/catalog/stone-intent';
import {guardBuyerCatalogReply} from '../src/catalog/buyer-reply-guard';

const SYNTH = {
  title: 'Złoty pierścionek z szafirem syntetycznym',
  handle: 'zloty-pierscionek-z-szafirem',
  url: 'https://epirbizuteria.pl/products/zloty-pierscionek-z-szafirem',
};
const NATURAL = {
  title: 'Złoty pierścionek z naturalnym szafirem',
  handle: 'zloty-pierscionek-z-naturalnym-szafirem',
  url: 'https://epirbizuteria.pl/products/zloty-pierscionek-z-naturalnym-szafirem',
};

describe('etap2 origin turn context', () => {
  it('does not put origin words into shopify query', () => {
    const intent = detectStoneIntent('szafir')!;
    expect(originCatalogQuery('natural', intent)).toBe(shopifyStoneQuery(intent));
    expect(originCatalogQuery('natural', intent)).not.toMatch(/naturaln/);
  });

  it('resets origin after stone-only turn', () => {
    expect(originAskForTurn(['naturalny szafir', 'pierścionek z szafirem'])).toBeNull();
  });

  it('inherits origin on price continuation', () => {
    expect(originAskForTurn(['naturalny szafir', 'a droższy, poszukaj'])).toBe('natural');
  });

  it('uses OR group for sapphire search', () => {
    const intent = detectStoneIntent('szafir')!;
    expect(shopifyStoneLemmaGroup(intent)).toBe('(szafir OR sapphire)');
    expect(ringRetryQuery(shopifyStoneQuery(intent))).toContain('OR');
    expect(ringRetryQuery(shopifyStoneQuery(intent))).not.toMatch(/pierścionek obrączka soliter/);
  });

  it('falls back to stone cards with origin_on_card instead of empty miss', () => {
    const result = applyOriginFilterWithFallback([SYNTH], 'natural');
    expect(result.originFallback).toBe(true);
    expect(result.products[0]?.origin_on_card).toBeTruthy();
  });

  it('blocks internal instruction leak to buyer', () => {
    const guarded = guardBuyerCatalogReply(STALE_INTERNAL, {
      buyerTurns: ['pierścionek srebrny'],
      catalogSnapshots: [{content: [{type: 'text', text: JSON.stringify({products: [NATURAL]})}]}],
    });
    expect(guarded.replaced).toBe(true);
    expect(guarded.text).not.toMatch(/metal biorę z karty/i);
    expect(guarded.text).toContain('epirbizuteria.pl');
  });
});

const STALE_INTERNAL =
  'Przy tej próbie nie wracam do poprzedniej listy. Metal biorę z karty produktu, o który pytasz.';
