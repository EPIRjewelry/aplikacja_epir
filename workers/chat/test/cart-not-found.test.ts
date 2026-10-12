import {describe, expect, it, vi, beforeEach} from 'vitest';
import {
  CART_NOT_FOUND_CLIENT_MESSAGE,
  isCartNotFoundResult,
} from '../src/buyer/cart-not-found';
import {executeBuyerTool} from '../src/buyer/execute-buyer-tool';
import * as mcp from '../src/mcp_server';

/** Fixture: Shopify/UCP zwraca not_found jako zwykły wynik z messages. */
export const GET_CART_NOT_FOUND_FIXTURE = {
  id: 'gid://shopify/Cart/gone',
  messages: [
    {
      type: 'error',
      code: 'not_found',
      content: 'Cart not found',
      severity: 'unrecoverable',
    },
  ],
  line_items: [],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('isCartNotFoundResult', () => {
  it('detects messages type=error code=not_found', () => {
    expect(isCartNotFoundResult(GET_CART_NOT_FOUND_FIXTURE)).toBe(true);
  });

  it('does not flag healthy cart', () => {
    expect(
      isCartNotFoundResult({
        id: 'gid://shopify/Cart/ok',
        line_items: [{quantity: 1, item: {id: 'gid://shopify/ProductVariant/1'}}],
        continue_url: 'https://x/cart/c/t',
      }),
    ).toBe(false);
  });
});

describe('update_cart with cart not_found', () => {
  it('does not call update_cart; returns client notice', async () => {
    const spy = vi.spyOn(mcp, 'callMcpToolDirect').mockImplementation(async (_e, name) => {
      if (name === 'get_cart') {
        return {result: GET_CART_NOT_FOUND_FIXTURE};
      }
      throw new Error(`unexpected MCP tool ${name}`);
    });
    const out = await executeBuyerTool({
      env: {SHOP_DOMAIN: 'shop.myshopify.com'} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'update_cart',
      argsJson: JSON.stringify({
        update_items: [{id: 'li1', quantity: 2}],
      }),
      sessionCartId: 'gid://shopify/Cart/gone',
      allowedVariantIds: new Set(),
    });
    expect(spy.mock.calls.map((c) => c[1])).toEqual(['get_cart']);
    expect(out.cartMutationSucceeded).toBeFalsy();
    const parsed = JSON.parse(out.content) as {error?: string; notice?: string};
    expect(parsed.error).toBe('cart_not_found');
    expect(parsed.notice).toBe(CART_NOT_FOUND_CLIENT_MESSAGE);
    expect(out.content).toContain(CART_NOT_FOUND_CLIENT_MESSAGE);
  });
});
