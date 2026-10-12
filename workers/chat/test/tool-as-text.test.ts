import {describe, expect, it} from 'vitest';
import {
  looksLikeToolCallAsText,
  toolAsTextKeyNames,
  toolNameFromAsText,
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
});
