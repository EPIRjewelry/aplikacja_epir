/**
 * E4 budget filters (D1).
 * - **M-E4-9** — stały próg priceMax dla „tanio” → T-E4-BUDGET-1 FAIL
 * - **M-E4-10** — liczba ze slotu bez tekstu → T-E4-BUDGET-2 FAIL
 */
import {describe, expect, it} from 'vitest';
import {
  budgetMinorFromSlots,
  slotsToCatalogFilters,
  sortMatchesByMinVariantPrice,
} from '../../../src/gemma/actions/slots-to-filters';
import {moneyFromMinor} from '../../../src/facts/types';
import {fictionalMatchFromProduct, fictionalMultiVariantProduct} from '../fixtures/fictional-catalog-products';

describe('E4 slots-to-filters', () => {
  it('T-E4-BUDGET-1: qualitative budget does not set priceMax; sort ascending by min variant', () => {
    const corpus = 'prezent dla żony, skromnie, tanio';
    expect(budgetMinorFromSlots({budget: 'tanio, skromnie'}, corpus)).toBeUndefined();
    const filters = slotsToCatalogFilters({budget: 'tanio', recipient: 'żona'}, corpus);
    expect(filters.priceMax).toBeUndefined();

    const cheap = fictionalMultiVariantProduct();
    const expensive = {...fictionalMultiVariantProduct(), productId: 'gid://shopify/Product/900002'};
    expensive.variants[0].price = moneyFromMinor(900_000);
    const sorted = sortMatchesByMinVariantPrice([
      fictionalMatchFromProduct(expensive),
      fictionalMatchFromProduct(cheap),
    ]);
    expect(sorted[0].minMinor).toBeLessThan(sorted[1].minMinor);
  });

  it('T-E4-BUDGET-2: numeric budget only when digits appear in user corpus', () => {
    const corpus = 'szukam prezentu do 500 zł';
    expect(budgetMinorFromSlots({budget: '500'}, corpus)).toBe(50_000);
    const filters = slotsToCatalogFilters({budget: '500'}, corpus);
    expect(filters.priceMax?.minor).toBe(50_000);
    expect(budgetMinorFromSlots({budget: '500'}, 'bez liczb')).toBeUndefined();
  });
});
