import {describe, expect, it} from 'vitest';
import {
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

  it('reads storefront from attribute list', () => {
    expect(
      readEpirStorefrontFromAttributes([
        {key: '_epir_storefront', value: 'zareczyny'},
      ]),
    ).toBe('zareczyny');
    expect(readEpirStorefrontFromAttributes([])).toBeNull();
  });
});
