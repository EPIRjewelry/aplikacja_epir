import { describe, expect, it } from 'vitest';
import { injectSessionCartIdIntoArgs } from '../src/utils/commerce-result';

describe('cart inject', () => {
  it('does not inject for search_catalog', () => {
    const args = { catalog: { query: 'pierścionek' } };
    expect(injectSessionCartIdIntoArgs('search_catalog', args, 'gid://shopify/Cart/x?key=y')).toEqual(
      args,
    );
  });

  it('injects session cart for get_cart when model omitted cart_id', () => {
    const out = injectSessionCartIdIntoArgs('get_cart', {}, 'gid://shopify/Cart/s?key=k');
    expect(out.cart_id).toBe('gid://shopify/Cart/s?key=k');
  });

  it('keeps valid client cart_id over session', () => {
    const client = 'gid://shopify/Cart/client?key=ck';
    const session = 'gid://shopify/Cart/session?key=sk';
    const out = injectSessionCartIdIntoArgs('get_cart', { cart_id: client }, session);
    expect(out.cart_id).toBe(client);
  });
});
