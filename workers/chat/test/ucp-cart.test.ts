import { describe, expect, it } from 'vitest';
import { applyCartPatch } from '../src/cart/ucp-cart';

describe('applyCartPatch', () => {
  it('drops a line that is not in the replacement set', () => {
    const next = applyCartPatch(
      [
        { quantity: 1, item: { id: 'gid://shopify/ProductVariant/1' }, lineId: 'line-1' },
        { quantity: 1, item: { id: 'gid://shopify/ProductVariant/2' }, lineId: 'line-2' },
      ],
      { remove_line_ids: ['line-2'] },
    );
    expect(next).toEqual([{ quantity: 1, item: { id: 'gid://shopify/ProductVariant/1' } }]);
  });

  it('keeps existing lines when only adding', () => {
    const next = applyCartPatch(
      [{ quantity: 1, item: { id: 'gid://shopify/ProductVariant/1' }, lineId: 'line-1' }],
      { add_items: [{ product_variant_id: 'gid://shopify/ProductVariant/2', quantity: 1 }] },
    );
    expect(next).toEqual([
      { quantity: 1, item: { id: 'gid://shopify/ProductVariant/1' } },
      { quantity: 1, item: { id: 'gid://shopify/ProductVariant/2' } },
    ]);
  });
});
