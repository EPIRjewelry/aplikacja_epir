import {describe, expect, it} from 'vitest';
import {
  EPIR_ONLINE_STORE_PRODUCT_TYPES,
  expandBuyerProductTypeSlotToExactTypes,
  productFactsProductTypeMatchesSlots,
} from '../../src/facts/product-type-buyer-taxonomy';

describe('product-type-buyer-taxonomy — Admin SSOT', () => {
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
