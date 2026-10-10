import { describe, expect, it } from 'vitest';

import { buildBuyerToolDefinitions, buyerToolIdForName } from '../src/buyer/buyer-tools';

describe('buyer-tools definitions', () => {
  it('omits cart tools when ucp_cart not in readiness', () => {
    const defs = buildBuyerToolDefinitions(['get_size_table']);
    const names = defs.map((d) => d.function.name);
    expect(names).toEqual(['get_size_table']);
    expect(names).not.toContain('create_cart');
  });

  it('maps ucp_cart to four cart tools without id/cart_id in schemas', () => {
    const defs = buildBuyerToolDefinitions(['ucp_cart']);
    const names = defs.map((d) => d.function.name);
    expect(names).toEqual(['create_cart', 'get_cart', 'update_cart', 'cancel_cart']);

    for (const name of ['get_cart', 'update_cart', 'cancel_cart'] as const) {
      const def = defs.find((d) => d.function.name === name)!;
      const props = (def.function.parameters as { properties?: Record<string, unknown> }).properties ?? {};
      expect(props).not.toHaveProperty('id');
      expect(props).not.toHaveProperty('cart_id');
    }
  });

  it('buyerToolIdForName maps cart names to ucp_cart', () => {
    expect(buyerToolIdForName('create_cart')).toBe('ucp_cart');
    expect(buyerToolIdForName('search_shop_policies_and_faqs')).toBe(
      'search_shop_policies_and_faqs',
    );
    expect(buyerToolIdForName('search_catalog')).toBeNull();
  });
});
