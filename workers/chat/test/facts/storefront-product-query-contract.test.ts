/**
 * Kontrakt: pola w zapytaniu Storefront Product muszą istnieć w schemacie API.
 * @see https://shopify.dev/docs/api/storefront/latest/objects/Product
 */
import {describe, expect, it} from 'vitest';
import {STOREFRONT_PRODUCT_NODE_FIELDS} from '../../src/facts/storefront-live';

const ALLOWED_PRODUCT_SELECTION_ROOTS = new Set([
  'id',
  'handle',
  'title',
  'vendor',
  'productType',
  'isGiftCard',
  'descriptionHtml',
  'onlineStoreUrl',
  'featuredImage',
  'collections',
  'options',
  'metafields',
  'gemstoneTypeMeta',
  'jewelryMaterialMeta',
  'stoneEducationMeta',
  'variants',
]);

function rootScalarFieldsFromFragment(fragment: string): string[] {
  const firstLine = fragment.trim().split('\n')[0]?.trim() ?? '';
  return firstLine.split(/\s+/).filter(Boolean);
}

describe('Storefront Product GraphQL contract', () => {
  it('T-STOREFRONT-PRODUCT-FIELDS-1: nodes query uses only documented Product roots', () => {
    const roots = rootScalarFieldsFromFragment(STOREFRONT_PRODUCT_NODE_FIELDS);
    expect(roots.length).toBeGreaterThan(0);
    for (const field of roots) {
      expect(ALLOWED_PRODUCT_SELECTION_ROOTS.has(field)).toBe(true);
    }
    expect(roots).toContain('isGiftCard');
    expect(roots).not.toContain('giftCard');
  });
});
