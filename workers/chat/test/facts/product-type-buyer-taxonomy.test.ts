import {describe, expect, it} from 'vitest';
import {
  EPIR_ONLINE_STORE_PRODUCT_TYPES,
  expandBuyerProductTypeSlotToExactTypes,
  productFactsProductTypeMatchesSlots,
} from '../../src/facts/product-type-buyer-taxonomy';

describe('product-type-buyer-taxonomy - Admin SSOT', () => {
  it('T-PT-MAP-1: pierścionek → Pierścionek + Pierścionek zaręczynowy (nie Pierścionki)', () => {
    const labels = expandBuyerProductTypeSlotToExactTypes('pierścionek');
    expect(labels).toEqual([
      EPIR_ONLINE_STORE_PRODUCT_TYPES.ring,
      EPIR_ONLINE_STORE_PRODUCT_TYPES.engagementRing,
    ]);
    expect(labels).not.toContain('Pierścionki');
  });

  it('T-PT-MAP-2: feed singulars Naszyjnik / Bransoletka; Kolczyki plural', () => {
    expect(expandBuyerProductTypeSlotToExactTypes('naszyjnik')).toEqual([
      EPIR_ONLINE_STORE_PRODUCT_TYPES.necklace,
    ]);
    expect(expandBuyerProductTypeSlotToExactTypes('bransoletka')).toEqual([
      EPIR_ONLINE_STORE_PRODUCT_TYPES.bracelet,
    ]);
    expect(expandBuyerProductTypeSlotToExactTypes('kolczyki')).toEqual([
      EPIR_ONLINE_STORE_PRODUCT_TYPES.earrings,
    ]);
  });

  it('T-PT-SOFT-1: pusty productType → soft keep', () => {
    expect(productFactsProductTypeMatchesSlots(null, ['pierścionek'])).toBe(true);
    expect(productFactsProductTypeMatchesSlots('', ['pierścionek'])).toBe(true);
  });

  it('T-PT-EXACT-1: Pierścionek match; Kolczyki nie', () => {
    expect(productFactsProductTypeMatchesSlots('Pierścionek', ['pierścionek'])).toBe(true);
    expect(productFactsProductTypeMatchesSlots('Pierścionek zaręczynowy', ['pierścionek'])).toBe(
      true,
    );
    expect(productFactsProductTypeMatchesSlots('Kolczyki', ['pierścionek'])).toBe(false);
  });
});

describe('product-type-buyer-taxonomy - synonym table (class A)', () => {
  const N = EPIR_ONLINE_STORE_PRODUCT_TYPES.necklace;
  const E = EPIR_ONLINE_STORE_PRODUCT_TYPES.engagementRing;
  const K = EPIR_ONLINE_STORE_PRODUCT_TYPES.earrings;
  const O = EPIR_ONLINE_STORE_PRODUCT_TYPES.weddingBand;

  it.each([
    ['wisior', N],
    ['wisiory', N],
    ['wisiorek', N],
    ['łańcuszek', N],
    ['łańcuch', N],
    ['pendant', N],
    ['choker', N],
    ['necklace', N],
  ] as const)('T-PT-NECK: %s → Naszyjnik', (term, label) => {
    expect(expandBuyerProductTypeSlotToExactTypes(term)).toEqual([label]);
  });

  it.each([
    ['zaręczynowy', E],
    ['pierścionek zaręczynowy', E],
    ['engagement', E],
    ['engagement ring', E],
  ] as const)('T-PT-ENG: %s → Pierścionek zaręczynowy only', (term, label) => {
    expect(expandBuyerProductTypeSlotToExactTypes(term)).toEqual([label]);
  });

  it.each([
    ['kolczyk', K],
    ['earrings', K],
    ['earring', K],
  ] as const)('T-PT-EAR: %s → Kolczyki', (term, label) => {
    expect(expandBuyerProductTypeSlotToExactTypes(term)).toEqual([label]);
  });

  it.each([
    ['obrączka', O],
    ['obrączki', O],
  ] as const)('T-PT-BAND: %s → Obrączka', (term, label) => {
    expect(expandBuyerProductTypeSlotToExactTypes(term)).toEqual([label]);
  });

  it('T-PT-WEDDING-EN-OMIT: wedding ring/band not mapped (no Obrączka hijack)', () => {
    expect(expandBuyerProductTypeSlotToExactTypes('wedding ring')).toEqual(['wedding ring']);
    expect(expandBuyerProductTypeSlotToExactTypes('wedding band')).toEqual(['wedding band']);
    expect(expandBuyerProductTypeSlotToExactTypes('wedding ring')).not.toContain(O);
    expect(expandBuyerProductTypeSlotToExactTypes('wedding band')).not.toContain(O);
  });

  it('T-PT-NECK-MATCH: wisior matches Admin Naszyjnik', () => {
    expect(productFactsProductTypeMatchesSlots('Naszyjnik', ['wisior'])).toBe(true);
    expect(productFactsProductTypeMatchesSlots('Kolczyki', ['wisior'])).toBe(false);
  });
});
