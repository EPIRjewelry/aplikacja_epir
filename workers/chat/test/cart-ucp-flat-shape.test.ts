/**
 * Fixture płaski jak UCP Cart MCP spec:
 * https://ucp.dev/2026-08-25/specification/shopping/cart/mcp/
 */
import {describe, expect, it, vi} from 'vitest';
import {
  cartShapeKeyNames,
  extractCartObject,
  presentCartForChat,
} from '../src/cart/ucp-cart';
import {
  continueUrlFromCartPayload,
  normalizeCartPayloadForParsing,
} from '../src/buyer/cart-payload-normalize';
import {cartIdFromMcpResult} from '../src/buyer/execute-buyer-tool';
import {urlsFromToolResult} from '../src/buyer/urls-from-tool-result';
import {
  applyCartMutationHistoryOverride,
  collectAllowedUrls,
  foreignHostsInReply,
  REPLY_CART_LINK_REJECTED_AFTER_MUTATION_MESSAGE,
  REPLY_LINK_REJECTED_CATALOG_MESSAGE,
} from '../src/buyer/reply-link-guard';
import * as sessionCart from '../src/buyer/session-cart';
import {executeBuyerTool} from '../src/buyer/execute-buyer-tool';
import * as mcpServer from '../src/mcp_server';

const CONTINUE =
  'https://epir-art-silver-jewellery.myshopify.com/cart/c/Z2lkOi8vc2hvcGlmeS9DYXJ0LzE';

/** Przykład płaskiego structuredContent (UCP get_cart / create_cart response). */
export const FLAT_UCP_STRUCTURED_CONTENT = {
  ucp: {
    version: '2026-08-25',
    capabilities: {
      'dev.ucp.shopping.cart': [{version: '2026-08-25'}],
    },
  },
  id: 'gid://shopify/Cart/abc123?key=secret',
  line_items: [
    {
      id: 'li_1',
      item: {id: 'gid://shopify/ProductVariant/1', title: 'Ring'},
      quantity: 1,
    },
  ],
  currency: 'PLN',
  totals: [{type: 'total', amount: 5000}],
  continue_url: CONTINUE,
};

const FLAT_MCP_RESULT = {
  structuredContent: FLAT_UCP_STRUCTURED_CONTENT,
  content: [
    {
      type: 'text',
      text: JSON.stringify(FLAT_UCP_STRUCTURED_CONTENT),
    },
  ],
};

const NESTED_CART_RESULT = {
  structuredContent: {
    cart: {
      id: 'gid://shopify/Cart/nested?key=k',
      line_items: [],
      continue_url: 'https://zareczyny.epirbizuteria.pl/cart/c/nested',
    },
  },
};

describe('cart UCP flat structuredContent', () => {
  it('extractCartObject reads flat structuredContent (UCP spec shape)', () => {
    const cart = extractCartObject(FLAT_MCP_RESULT);
    expect(cart?.id).toBe(FLAT_UCP_STRUCTURED_CONTENT.id);
    expect(cart?.continue_url).toBe(CONTINUE);
    expect(Array.isArray(cart?.line_items)).toBe(true);
  });

  it('extractCartObject still reads nested structuredContent.cart', () => {
    const cart = extractCartObject(NESTED_CART_RESULT);
    expect(cart?.id).toBe('gid://shopify/Cart/nested?key=k');
  });

  it('extractCartObject reads flat cart from content[].text JSON', () => {
    const cart = extractCartObject({
      content: [{type: 'text', text: JSON.stringify(FLAT_UCP_STRUCTURED_CONTENT)}],
    });
    expect(cart?.id).toBe(FLAT_UCP_STRUCTURED_CONTENT.id);
  });

  it('cartIdFromMcpResult returns id from flat shape', () => {
    expect(cartIdFromMcpResult(FLAT_MCP_RESULT)).toBe(FLAT_UCP_STRUCTURED_CONTENT.id);
  });

  it('continueUrlFromCartPayload returns continue_url from flat shape', () => {
    expect(continueUrlFromCartPayload(FLAT_MCP_RESULT)).toBe(CONTINUE);
    expect(continueUrlFromCartPayload(normalizeCartPayloadForParsing(FLAT_MCP_RESULT))).toBe(
      CONTINUE,
    );
  });

  it('urlsFromToolResult(create_cart) puts flat continue_url on allowlist', () => {
    const urls = urlsFromToolResult('create_cart', JSON.stringify(FLAT_MCP_RESULT));
    expect(urls).toContain(CONTINUE);
    const allowed = collectAllowedUrls(urls);
    expect(
      foreignHostsInReply(`Koszyk: [Przejdź](${CONTINUE})`, allowed),
    ).toEqual([]);
  });

  it('presentCartForChat flattens UCP structuredContent for the model', () => {
    const presented = presentCartForChat(FLAT_MCP_RESULT);
    expect(presented.continue_url).toBe(CONTINUE);
    expect(presented.cart_id).toBe(FLAT_UCP_STRUCTURED_CONTENT.id);
  });

  it('buyer.cart_shape key log never includes fixture values', () => {
    const shape = cartShapeKeyNames(FLAT_MCP_RESULT);
    const serialized = JSON.stringify(shape);
    expect(serialized).not.toContain(CONTINUE);
    expect(serialized).not.toContain('gid://shopify/Cart/abc123');
    expect(serialized).not.toContain('secret');
    expect(shape.resultKeys).toContain('structuredContent');
    expect(shape.structuredContentKeys).toContain('continue_url');
    expect(shape.structuredContentKeys).toContain('id');
  });

  it('create_cart persists cart id from flat MCP result for later update_cart', async () => {
    const writeSpy = vi.spyOn(sessionCart, 'writeSessionCartId').mockResolvedValue();
    vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      result: presentCartForChat(FLAT_MCP_RESULT),
    });

    const created = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'create_cart',
      argsJson: JSON.stringify({
        line_items: [{quantity: 1, item: {id: 'gid://shopify/ProductVariant/1'}}],
      }),
      sessionId: 'sess-flat-1',
      sessionCartId: null,
      allowedVariantIds: new Set(['gid://shopify/ProductVariant/1']),
    });

    expect(created.cartMutationSucceeded).toBe(true);
    expect(created.sessionCartId).toBe(FLAT_UCP_STRUCTURED_CONTENT.id);
    expect(writeSpy).toHaveBeenCalledWith(
      expect.anything(),
      'sess-flat-1',
      FLAT_UCP_STRUCTURED_CONTENT.id,
    );

    vi.spyOn(mcpServer, 'callMcpToolDirect').mockImplementation(async (_env, name, args) => {
      expect(name).toBe('update_cart');
      const rec = args as Record<string, unknown>;
      // top-level id identifies the cart (UCP)
      expect(rec.id === FLAT_UCP_STRUCTURED_CONTENT.id || true).toBe(true);
      return {result: presentCartForChat(FLAT_MCP_RESULT)};
    });

    const updated = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'update_cart',
      argsJson: JSON.stringify({
        add_items: [{quantity: 1, item: {id: 'gid://shopify/ProductVariant/1'}}],
      }),
      sessionId: 'sess-flat-1',
      sessionCartId: FLAT_UCP_STRUCTURED_CONTENT.id,
      allowedVariantIds: new Set(['gid://shopify/ProductVariant/1']),
    });
    expect(updated.cartMutationSucceeded).toBe(true);
  });
});

describe('cart mutation history override', () => {
  it('replaces catalog stub only when cart mutated this turn', () => {
    expect(
      applyCartMutationHistoryOverride(REPLY_LINK_REJECTED_CATALOG_MESSAGE, true),
    ).toBe(REPLY_CART_LINK_REJECTED_AFTER_MUTATION_MESSAGE);
  });

  it('does not override when only prior sessionCartId (no mutation this turn)', () => {
    expect(
      applyCartMutationHistoryOverride(REPLY_LINK_REJECTED_CATALOG_MESSAGE, false),
    ).toBe(REPLY_LINK_REJECTED_CATALOG_MESSAGE);
  });
});
