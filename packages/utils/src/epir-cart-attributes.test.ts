import {describe, expect, it} from 'vitest';
import {
  EPIR_SESSION_CART_ATTR_KEY,
  EPIR_STOREFRONT_CART_ATTR_KEY,
  readEpirStorefrontFromAttributes,
  withStorefrontCartInput,
} from './epir-cart-attributes';

describe('epir-cart-attributes', () => {
  it('merges storefront attribute on cart create input', () => {
    const input = withStorefrontCartInput({lines: []}, 'kazka');
    expect(input.attributes).toEqual([
      {key: EPIR_STOREFRONT_CART_ATTR_KEY, value: 'kazka'},
    ]);
  });

  it('merges session attribute when provided', () => {
    const input = withStorefrontCartInput({lines: []}, 'zareczyny', 'sess-cookie-1');
    expect(input.attributes).toEqual(
      expect.arrayContaining([
        {key: EPIR_STOREFRONT_CART_ATTR_KEY, value: 'zareczyny'},
        {key: EPIR_SESSION_CART_ATTR_KEY, value: 'sess-cookie-1'},
      ]),
    );
  });

  it('reads storefront from attribute list', () => {
    expect(
      readEpirStorefrontFromAttributes([
        {key: '_epir_storefront', value: 'zareczyny'},
      ]),
    ).toBe('zareczyny');
    expect(readEpirStorefrontFromAttributes([])).toBeNull();
  });
});
