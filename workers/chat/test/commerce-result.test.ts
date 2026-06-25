import { describe, expect, it } from 'vitest';
import {
  buildCommerceActionPayload,
  extractCartIdFromMcpResult,
  extractCheckoutUrlFromMcpResult,
  injectSessionCartIdIntoArgs,
  isLikelyAjaxCartFakeGid,
  resolveCartIdForMcp,
} from '../src/utils/commerce-result';

describe('commerce-result', () => {
  it('detects Ajax cart GID without key', () => {
    expect(isLikelyAjaxCartFakeGid('gid://shopify/Cart/abc123token')).toBe(true);
    expect(isLikelyAjaxCartFakeGid('gid://shopify/Cart/abc?key=secret')).toBe(false);
  });

  it('prefers session cart over Ajax fake GID', () => {
    const session = 'gid://shopify/Cart/real?key=secret';
    const ajax = 'gid://shopify/Cart/ajaxtoken';
    expect(resolveCartIdForMcp(ajax, session)).toBe(session);
  });

  it('injects session cart_id for update_cart', () => {
    const out = injectSessionCartIdIntoArgs(
      'update_cart',
      { add_items: [{ product_variant_id: 'gid://shopify/ProductVariant/1', quantity: 1 }] },
      'gid://shopify/Cart/s1?key=k1',
    );
    expect(out.cart_id).toBe('gid://shopify/Cart/s1?key=k1');
  });

  it('extracts checkout_url from nested cart', () => {
    const url = extractCheckoutUrlFromMcpResult({
      cart: {
        id: 'gid://shopify/Cart/c1?key=k1',
        checkoutUrl: 'https://shop.example/checkouts/co/1',
      },
    });
    expect(url).toBe('https://shop.example/checkouts/co/1');
  });

  it('builds commerce action payload', () => {
    const payload = buildCommerceActionPayload(
      {
        cart: {
          id: 'gid://shopify/Cart/c1?key=k1',
          checkoutUrl: 'https://shop.example/checkouts/co/1',
          lines: [{ id: 'l1' }, { id: 'l2' }],
        },
      },
      'shop.example',
    );
    expect(payload?.type).toBe('cart_updated');
    expect(payload?.cart_id).toContain('gid://shopify/Cart/c1');
    expect(payload?.checkout_url).toContain('checkouts');
    expect(payload?.line_count).toBe(2);
  });

  it('extracts cart id from flat result', () => {
    expect(extractCartIdFromMcpResult({ id: 'gid://shopify/Cart/x?key=y' })).toBe(
      'gid://shopify/Cart/x?key=y',
    );
  });
});
