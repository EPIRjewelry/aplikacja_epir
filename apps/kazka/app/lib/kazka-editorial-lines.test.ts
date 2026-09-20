import {describe, expect, it} from 'vitest';
import {KAZKA_EDITORIAL_LINES} from './kazka-editorial-assets';

describe('KAZKA_EDITORIAL_LINES', () => {
  it('exposes four curated lines linked to dedicated collections', () => {
    expect(KAZKA_EDITORIAL_LINES.map((line) => line.label)).toEqual([
      'Classic',
      'Big Lab',
      'Fancy Cut',
      'Kamienie szlachetne',
    ]);
    expect(KAZKA_EDITORIAL_LINES.map((line) => line.href)).toEqual([
      '/collections/kazka-classic',
      '/collections/kazka-big-lab',
      '/collections/kazka-fancy-cut',
      '/collections/kazka-kamienie-szlachetne',
    ]);
  });

  it('uses updated line tile CDN assets', () => {
    expect(KAZKA_EDITORIAL_LINES[0].image).toContain('classic.png');
    expect(KAZKA_EDITORIAL_LINES[1].image).toContain('big-lab.png');
    expect(KAZKA_EDITORIAL_LINES[2].image).toContain('fancy-cut.png');
  });

  it('gives each line an image and a short body', () => {
    for (const line of KAZKA_EDITORIAL_LINES) {
      expect(line.image.length).toBeGreaterThan(0);
      expect(line.body.length).toBeGreaterThan(10);
      expect(line.alt.length).toBeGreaterThan(0);
    }
  });
});
