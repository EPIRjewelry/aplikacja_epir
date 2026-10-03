import { describe, expect, it } from 'vitest';
import {
  formatRecognizedMemoryLine,
  formatSessionPixelPlace,
  pickSessionPixelPlace,
} from '../src/turn/session-place';

describe('session pixel place', () => {
  it('prefers the latest product view over a later click without a product', () => {
    const place = pickSessionPixelPlace([
      { page_url: 'https://epirbizuteria.pl/cart', page_title: 'Koszyk' },
      {
        page_url: 'https://epirbizuteria.pl/products/galazki',
        product_title: 'Gałązki',
      },
    ]);
    expect(place).toEqual({
      pageUrl: 'https://epirbizuteria.pl/products/galazki',
      productTitle: 'Gałązki',
      productHandle: 'galazki',
    });
    expect(formatSessionPixelPlace(place!)).toBe(
      'Gdzie jest kupujący (piksel tej sesji): https://epirbizuteria.pl/products/galazki — Gałązki',
    );
  });

  it('returns null when the session has no url or product', () => {
    expect(pickSessionPixelPlace([{ page_url: '  ', product_title: '' }])).toBeNull();
  });
});

describe('recognized memory line', () => {
  it('joins person_memory and memory_facts into one short line', () => {
    expect(formatRecognizedMemoryLine('lubi młotkowane złoto', 'rozmiar: 17')).toBe(
      'Skrót pamięci rozpoznanego klienta: lubi młotkowane złoto Fakty: rozmiar: 17',
    );
  });

  it('stays empty when the customer has no memory', () => {
    expect(formatRecognizedMemoryLine(null, '  ')).toBeNull();
  });
});
