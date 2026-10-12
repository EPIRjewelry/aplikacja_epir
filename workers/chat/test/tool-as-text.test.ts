import {describe, expect, it} from 'vitest';
import {
  ASK_VARIANT_BEFORE_CART_MESSAGE,
  looksLikeToolCallAsText,
  toolAsTextCartMutationAllowed,
  toolAsTextKeyNames,
  toolNameFromAsText,
  variantIdsFromToolAsText,
} from '../src/buyer/tool-as-text';

describe('tool-as-text detector', () => {
  it('detects action:update_cart shape from retest', () => {
    const text = JSON.stringify({
      action: 'update_cart',
      cart_id: 'gid://shopify/Cart/x',
      line_items: [{id: 'li', quantity: 2}],
    });
    expect(looksLikeToolCallAsText(text)).toBe(true);
    expect(toolNameFromAsText(text)).toBe('update_cart');
    expect(toolAsTextKeyNames(text)).toEqual(['action', 'cart_id', 'line_items']);
  });

  it('detects tool:search_catalog shape from retest', () => {
    const text = '```json\n{"tool":"search_catalog","query":"pierścionek"}\n```';
    expect(looksLikeToolCallAsText(text)).toBe(true);
    expect(toolNameFromAsText(text)).toBe('search_catalog');
  });

  it('does not flag ordinary prose with braces', () => {
    expect(
      looksLikeToolCallAsText('Cena to około {100} zł — potwierdzę w katalogu.'),
    ).toBe(false);
    expect(looksLikeToolCallAsText('{"cena":100,"waluta":"PLN"}')).toBe(false);
  });

  it('allows cart mutation force only when variant is on allowlist', () => {
    const allowed = 'gid://shopify/ProductVariant/ALLOWED';
    const withVariant = JSON.stringify({
      action: 'create_cart',
      line_items: [{quantity: 1, item: {id: allowed}}],
    });
    const withoutVariant = JSON.stringify({
      action: 'create_cart',
      line_items: [{id: 'li', quantity: 1}],
    });
    expect(variantIdsFromToolAsText(withVariant)).toEqual([allowed]);
    expect(
      toolAsTextCartMutationAllowed(withVariant, new Set([allowed])),
    ).toBe(true);
    expect(
      toolAsTextCartMutationAllowed(withoutVariant, new Set([allowed])),
    ).toBe(false);
    expect(ASK_VARIANT_BEFORE_CART_MESSAGE).toMatch(/rozmiar|wariant/i);
  });
});
