/**
 * E2b — cena per wariant (gemma/facts).
 *
 * Mutacje (cofnij → RED):
 * - **M-E2b-2** — W `variant-prices.ts` użyj `product.variants[0]` zamiast `matchingVariants` → T-E2b-VAR-3 FAIL.
 */
import {describe, expect, it} from 'vitest';
import {buildGemmaVariantPriceFacts} from '../../../src/gemma/facts/variant-prices';
import {filterProducts} from '../../../src/facts/filter';
import {moneyFromMinor} from '../../../src/facts/types';
import {
  fictionalMatchFromProduct,
  fictionalMultiVariantProduct,
} from '../fixtures/fictional-catalog-products';

describe('E2b variant prices', () => {
  it('T-E2b-VAR-1: three different variant minors → three lines and non-flat range', () => {
    const match = fictionalMatchFromProduct(fictionalMultiVariantProduct());
    const facts = buildGemmaVariantPriceFacts(match);
    expect(facts.lines).toHaveLength(3);
    expect(facts.isFlat).toBe(false);
    expect(facts.rangeText).toMatch(/różnią ceną/);
    expect(new Set(facts.lines.map((l) => l.minor))).toEqual(new Set([500_000, 120_000, 250_000]));
  });

  it('T-E2b-VAR-2: equal variant prices → flat, no range text', () => {
    const product = fictionalMultiVariantProduct();
    const flatMinor = moneyFromMinor(200_000);
    product.variants = product.variants.map((v) => ({...v, price: flatMinor}));
    const match = fictionalMatchFromProduct(product);
    const facts = buildGemmaVariantPriceFacts(match);
    expect(facts.isFlat).toBe(true);
    expect(facts.rangeText).toBeNull();
    expect(facts.lines.every((l) => l.minor === 200_000)).toBe(true);
  });

  it('T-E2b-VAR-3: budget excludes first (expensive) variant — cards use matchingVariants only', () => {
    const product = fictionalMultiVariantProduct();
    const match = fictionalMatchFromProduct(product, {priceMax: moneyFromMinor(200_000)});
    expect(match.matchingVariants[0]?.variantId).not.toBe('gid://shopify/ProductVariant/900001-a');
    const facts = buildGemmaVariantPriceFacts(match);
    expect(facts.lines.map((l) => l.variantId)).not.toContain('gid://shopify/ProductVariant/900001-a');
    expect(facts.lines.length).toBe(1);
    expect(facts.lines[0].minor).toBe(120_000);
  });
});
