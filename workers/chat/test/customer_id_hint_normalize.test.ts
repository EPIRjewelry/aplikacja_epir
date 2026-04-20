import { describe, expect, it } from 'vitest';
import { normalizeShopifyCustomerIdFromHint } from '../src/index';

describe('normalizeShopifyCustomerIdFromHint', () => {
  it('accepts numeric Shopify customer id strings', () => {
    expect(normalizeShopifyCustomerIdFromHint('1848062312553')).toBe('1848062312553');
  });

  it('accepts Customer GID and returns numeric id', () => {
    expect(normalizeShopifyCustomerIdFromHint('gid://shopify/Customer/1848062312553')).toBe('1848062312553');
  });

  it('rejects garbage', () => {
    expect(normalizeShopifyCustomerIdFromHint('')).toBeNull();
    expect(normalizeShopifyCustomerIdFromHint('abc')).toBeNull();
    expect(normalizeShopifyCustomerIdFromHint('12')).toBeNull();
  });
});
