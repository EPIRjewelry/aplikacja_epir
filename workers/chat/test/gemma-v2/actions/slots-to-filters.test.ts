/**
 * E4 budget filters (D1).
 * - **M-E4-9** — stały próg priceMax dla „tanio” → T-E4-BUDGET-1 FAIL
 * - **M-E4-10** — liczba ze slotu bez tekstu → T-E4-BUDGET-2 FAIL
 * - **M-E5-7** — zawsze priceMax → T-E5-BUDGET-DIR-1 FAIL
 * - **M-E5-7b** — marker z dala od liczby → T-E5-BUDGET-DIR-3 FAIL
 * - **M-E5-7c** — brak zakresu → T-E5-BUDGET-DIR-4 FAIL
 */
import {describe, expect, it} from 'vitest';
import {
  budgetMinorFromSlots,
  budgetPriceBoundsFromSlots,
  isQualitativeBudget,
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
    expensive.variants = expensive.variants.map((v) => ({...v, price: moneyFromMinor(900_000)}));
    const sorted = sortMatchesByMinVariantPrice([
      fictionalMatchFromProduct(expensive),
      fictionalMatchFromProduct(cheap),
    ]);
    expect(sorted[0].minMinor).toBeLessThan(sorted[1].minMinor);
    expect(isQualitativeBudget({budget: 'tanio'}, corpus)).toBe(true);
    // Bez budżetu słownego — kolejność repozytorium (trafność), bez sortowania po cenie.
    expect(isQualitativeBudget({recipient: 'żona'}, corpus)).toBe(false);
    const unsorted = sortMatchesByMinVariantPrice(
      [fictionalMatchFromProduct(expensive), fictionalMatchFromProduct(cheap)],
      false,
    );
    expect(unsorted[0].minMinor).toBe(900_000);
  });

  it('T-E4-BUDGET-2: numeric budget only when digits appear in user corpus', () => {
    const corpus = 'szukam prezentu do 500 zł';
    expect(budgetMinorFromSlots({budget: '500'}, corpus)).toBe(50_000);
    const filters = slotsToCatalogFilters({budget: '500'}, corpus);
    expect(filters.priceMax).toEqual(moneyFromMinor(50_000));
    expect(budgetMinorFromSlots({budget: '500'}, 'bez liczb')).toBeUndefined();
    // Podciąg nie wystarcza: „15” z „rozmiar 15” nie jest budżetem 1500.
    expect(budgetMinorFromSlots({budget: '1500'}, 'rozmiar 15, numer 00')).toBeUndefined();
    expect(budgetMinorFromSlots({budget: '1 500'}, 'do 1 500 zł')).toBe(150_000);
  });

  it('T-E5-BUDGET-DIR-1: od 2000 zł → priceMin only', () => {
    const corpus = 'szukam pierścionka od 2000 zł';
    const bounds = budgetPriceBoundsFromSlots({budget: '2000'}, corpus);
    expect(bounds.priceMin).toEqual(moneyFromMinor(200_000));
    expect(bounds.priceMax).toBeUndefined();
    const filters = slotsToCatalogFilters({budget: '2000'}, corpus);
    expect(filters.priceMin).toEqual(moneyFromMinor(200_000));
    expect(filters.priceMax).toBeUndefined();
  });

  it('T-E5-BUDGET-DIR-2: do 500 zł → priceMax', () => {
    const corpus = 'prezent do 500 zł';
    const bounds = budgetPriceBoundsFromSlots({budget: '500'}, corpus);
    expect(bounds.priceMax).toEqual(moneyFromMinor(50_000));
    expect(bounds.priceMin).toBeUndefined();
  });

  it('T-E5-BUDGET-DIR-3: od męża without marker before number → priceMax', () => {
    const corpus = 'prezent od męża, 2000 zł';
    const bounds = budgetPriceBoundsFromSlots({budget: '2000'}, corpus);
    expect(bounds.priceMax).toEqual(moneyFromMinor(200_000));
    expect(bounds.priceMin).toBeUndefined();
  });

  it('T-E5-BUDGET-DIR-4: od 1000 do 2000 zł → both bounds', () => {
    const corpus = 'budżet od 1000 do 2000 zł';
    const bounds = budgetPriceBoundsFromSlots({budget: '2000'}, corpus);
    expect(bounds.priceMin).toEqual(moneyFromMinor(100_000));
    expect(bounds.priceMax).toEqual(moneyFromMinor(200_000));
  });

  it('T-E5-BUDGET-DIR-5: slot budget without client digits → no bounds', () => {
    const bounds = budgetPriceBoundsFromSlots({budget: '2000'}, 'bez liczb w tekście');
    expect(bounds.priceMin).toBeUndefined();
    expect(bounds.priceMax).toBeUndefined();
  });

  it('T-E5-BUDGET-DIR-6: rozmiar 12-14 nie jest zakresem ceny', () => {
    const corpus = 'pierścionek rozmiar 12-14, do 2000 zł';
    const bounds = budgetPriceBoundsFromSlots({budget: '2000'}, corpus);
    expect(bounds.priceMin).toBeUndefined();
    expect(bounds.priceMax).toEqual(moneyFromMinor(200_000));
    expect(budgetPriceBoundsFromSlots({}, 'rozmiar 12-14')).toEqual({});
  });

  it('T-E5-BUDGET-DIR-7: „pod 2000 zł” nie jest markerem min', () => {
    const bounds = budgetPriceBoundsFromSlots({budget: '2000'}, 'coś pod 2000 zł');
    expect(bounds.priceMin).toBeUndefined();
    expect(bounds.priceMax).toEqual(moneyFromMinor(200_000));
  });
});
