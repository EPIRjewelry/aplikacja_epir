import { describe, expect, it } from 'vitest';

import { normalizeShopifyAmountToMajorUnits } from '../src/mcp/money-normalize';

describe('normalizeShopifyAmountToMajorUnits (PLN)', () => {
  it('treats large integers divisible by 100 as minor units (grosze)', () => {
    expect(normalizeShopifyAmountToMajorUnits(28000, 'PLN')).toBe(280);
    expect(normalizeShopifyAmountToMajorUnits('28000', 'PLN')).toBe(280);
  });

  it('keeps canonical decimal strings as major units', () => {
    expect(normalizeShopifyAmountToMajorUnits('280.00', 'PLN')).toBe(280);
    expect(normalizeShopifyAmountToMajorUnits('1999,50', 'PLN')).toBe(1999.5);
  });

  it('keeps small integers as major PLN (np. 280 zł)', () => {
    expect(normalizeShopifyAmountToMajorUnits(280, 'PLN')).toBe(280);
    expect(normalizeShopifyAmountToMajorUnits('280', 'PLN')).toBe(280);
  });

  it('keeps 1500 PLN-style integers without false minor decode', () => {
    expect(normalizeShopifyAmountToMajorUnits(1500, 'PLN')).toBe(1500);
    expect(normalizeShopifyAmountToMajorUnits('1500', 'PLN')).toBe(1500);
  });
});
