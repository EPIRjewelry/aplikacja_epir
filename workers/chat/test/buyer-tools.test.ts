import { describe, expect, it } from 'vitest';

import {
  MODEL_WIRED_BUYER_TOOLS,
  buildBuyerToolDefinitions,
  buyerToolIdForName,
  filterModelWiredBuyerTools,
} from '../src/buyer/buyer-tools';

describe('buyer-tools definitions', () => {
  it('MODEL_WIRED_BUYER_TOOLS includes search_catalog and excludes customer_account_profile', () => {
    expect(MODEL_WIRED_BUYER_TOOLS).toEqual([
      'search_catalog',
      'ucp_cart',
      'search_shop_policies_and_faqs',
      'get_size_table',
    ]);
    expect(filterModelWiredBuyerTools(['search_catalog', 'ucp_cart', 'customer_account_profile'])).toEqual([
      'search_catalog',
      'ucp_cart',
    ]);
  });

  it('omits cart tools when ucp_cart not in readiness', () => {
    const defs = buildBuyerToolDefinitions(['get_size_table', 'search_catalog']);
    const names = defs.map((d) => d.function.name);
    expect(names).toEqual(['search_catalog', 'get_size_table']);
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

  it('buyerToolIdForName maps cart names to ucp_cart and search_catalog', () => {
    expect(buyerToolIdForName('create_cart')).toBe('ucp_cart');
    expect(buyerToolIdForName('search_shop_policies_and_faqs')).toBe(
      'search_shop_policies_and_faqs',
    );
    expect(buyerToolIdForName('search_catalog')).toBe('search_catalog');
  });

  it('search_catalog definition rejects additionalProperties', () => {
    const defs = buildBuyerToolDefinitions(['search_catalog']);
    const sc = defs.find((d) => d.function.name === 'search_catalog')!;
    const params = sc.function.parameters as { additionalProperties?: boolean };
    expect(params.additionalProperties).toBe(false);
  });
});
