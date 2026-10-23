import {describe, expect, it} from 'vitest';
import {filterProducts} from '../../../src/facts/filter';
import {moneyFromMinor} from '../../../src/facts/types';
import {fictionalMultiVariantProduct} from '../fixtures/fictional-catalog-products';

const sample = fictionalMultiVariantProduct();

describe('E2b apply filters (reuse facts/filter)', () => {
  it('T-E2b-BUD-1: priceMax keeps only variants within budget', () => {
    const matches = filterProducts([sample], {priceMax: moneyFromMinor(200_000)});
    expect(matches).toHaveLength(1);
    expect(matches[0].matchingVariants).toHaveLength(1);
    expect(matches[0].matchingVariants.every((v) => (v.price.minor ?? 0) <= 200_000)).toBe(true);
  });

  it('T-E2b-BUD-2: priceMin above all variants drops product', () => {
    const matches = filterProducts([sample], {priceMin: moneyFromMinor(900_000)});
    expect(matches).toHaveLength(0);
  });

  it('T-E2b-METAL-1: metal filter on variant metal', () => {
    const product = {...sample, variants: sample.variants.map((v, i) => ({...v, metal: i === 0 ? 'srebro' : 'złoto 585'}))};
    const matches = filterProducts([product], {metal: ['srebro']});
    expect(matches[0].matchingVariants).toHaveLength(1);
    expect(matches[0].matchingVariants[0].metal).toBe('srebro');
  });

  it('T-E2b-STONE-1: stone filter on product.stones', () => {
    const matches = filterProducts([sample], {stone: ['fikcyjny szafir']});
    expect(matches).toHaveLength(1);
  });
});
