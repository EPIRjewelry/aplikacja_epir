import {describe, expect, it} from 'vitest';
import {cartIdFromMcpResult, variantIdsFromCartPayload} from '../src/buyer/execute-buyer-tool';
import {normalizeCartPayloadForParsing} from '../src/buyer/cart-payload-normalize';

describe('cart payload normalize (presentCartForChat shape)', () => {
  const flatFixture = {
    cart_id: 'gid://shopify/Cart/FLAT',
    continue_url: 'https://kazka.epirbizuteria.pl/cart/c/abc',
    line_items: [
      {
        id: 'gid://shopify/CartLine/1',
        quantity: 1,
        item: {id: 'gid://shopify/ProductVariant/42', title: 'Pierścionek'},
      },
    ],
  };

  it('extracts cart id from flat cart_id', () => {
    expect(cartIdFromMcpResult(flatFixture)).toBe('gid://shopify/Cart/FLAT');
  });

  it('parses line items after normalize wrap', () => {
    const wrapped = normalizeCartPayloadForParsing(flatFixture);
    const ids = variantIdsFromCartPayload(wrapped);
    expect(ids).toEqual(['gid://shopify/ProductVariant/42']);
  });
});
