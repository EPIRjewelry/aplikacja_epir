import {describe, expect, it} from 'vitest';
import {KAZKA_EDITORIAL_LINES} from './kazka-editorial-assets';

describe('KAZKA_EDITORIAL_LINES', () => {
  it('exposes three curated lines with linia query params', () => {
    expect(KAZKA_EDITORIAL_LINES.map((line) => line.label)).toEqual([
      'Classic',
      'Big Lab',
      'Fancy Cut',
    ]);
    expect(KAZKA_EDITORIAL_LINES.map((line) => line.href)).toEqual([
      '/collections/kazka?linia=classic',
      '/collections/kazka?linia=lab',
      '/collections/kazka?linia=fancy',
    ]);
  });

  it('gives each line an image and a short body', () => {
    for (const line of KAZKA_EDITORIAL_LINES) {
      expect(line.image.length).toBeGreaterThan(0);
      expect(line.body.length).toBeGreaterThan(10);
      expect(line.alt.length).toBeGreaterThan(0);
    }
  });
});
