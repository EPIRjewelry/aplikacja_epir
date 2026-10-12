/**
 * Fixture płaski jak UCP Cart MCP spec:
 * https://ucp.dev/2026-08-25/specification/shopping/cart/mcp/
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  cartShapeKeyNames,
  extractCartObject,
  presentCartForChat,
} from '../src/cart/ucp-cart';
import {
  continueUrlFromCartPayload,
  normalizeCartPayloadForParsing,
} from '../src/buyer/cart-payload-normalize';
import {
  cartIdFromMcpResult,
  executeBuyerTool,
  isSuccessfulCartMutationResult,
} from '../src/buyer/execute-buyer-tool';
import {urlsFromToolResult} from '../src/buyer/urls-from-tool-result';
import {buildCartContinueReply} from '../src/buyer/cart-continue-reply';
import {
  applyCartMutationHistoryOverride,
  collectAllowedUrls,
  foreignHostsInReply,
  REPLY_CART_LINK_REJECTED_AFTER_MUTATION_MESSAGE,
  REPLY_LINK_REJECTED_CATALOG_MESSAGE,
} from '../src/buyer/reply-link-guard';
import * as sessionCart from '../src/buyer/session-cart';
import * as mcpServer from '../src/mcp_server';
import {composeBuyerAssistantReply} from '../src/buyer/compose-buyer-turn';
import * as toolReadiness from '../src/buyer/tool-readiness';
import * as aiProfile from '../src/ai-profile';
import * as aiClient from '../src/ai-client';
import * as sessionHistory from '../src/buyer/session-history';
import * as executeBuyerToolMod from '../src/buyer/execute-buyer-tool';

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

beforeEach(() => {
  vi.restoreAllMocks();
});

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

    vi.spyOn(mcpServer, 'callMcpToolDirect').mockImplementation(
      async (_env, name, args, brandOrOptions) => {
        const opts =
          typeof brandOrOptions === 'object' && brandOrOptions
            ? brandOrOptions
            : {sessionCartId: null};
        expect(opts.sessionCartId).toBe(FLAT_UCP_STRUCTURED_CONTENT.id);
        if (name === 'get_cart') {
          return {result: presentCartForChat(FLAT_MCP_RESULT)};
        }
        expect(name).toBe('update_cart');
        const rec = args as Record<string, unknown>;
        expect(rec.id).toBe(FLAT_UCP_STRUCTURED_CONTENT.id);
        expect((rec.cart as Record<string, unknown>)?.id).toBeUndefined();
        return {result: presentCartForChat(FLAT_MCP_RESULT)};
      },
    );

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

describe('isSuccessfulCartMutationResult / cartMutationSucceeded', () => {
  it('rejects isError results', () => {
    expect(
      isSuccessfulCartMutationResult({
        isError: true,
        structuredContent: FLAT_UCP_STRUCTURED_CONTENT,
      }),
    ).toBe(false);
  });

  it('rejects cart messages with type error', () => {
    const withErr = presentCartForChat({
      structuredContent: {
        ...FLAT_UCP_STRUCTURED_CONTENT,
        messages: [
          {
            type: 'error',
            code: 'out_of_stock',
            content: 'Unavailable',
            severity: 'unrecoverable',
          },
        ],
      },
    });
    expect(isSuccessfulCartMutationResult(withErr)).toBe(false);
  });

  it('create_cart with isError does not set cartMutationSucceeded', async () => {
    vi.spyOn(sessionCart, 'writeSessionCartId').mockResolvedValue();
    vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      result: {isError: true, cart_id: FLAT_UCP_STRUCTURED_CONTENT.id},
    });
    const created = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'create_cart',
      argsJson: JSON.stringify({
        line_items: [{quantity: 1, item: {id: 'gid://shopify/ProductVariant/1'}}],
      }),
      sessionId: 'sess-err-1',
      sessionCartId: null,
      allowedVariantIds: new Set(['gid://shopify/ProductVariant/1']),
    });
    expect(created.cartMutationSucceeded).toBeFalsy();
    expect(
      applyCartMutationHistoryOverride(
        REPLY_LINK_REJECTED_CATALOG_MESSAGE,
        Boolean(created.cartMutationSucceeded),
      ),
    ).toBe(REPLY_LINK_REJECTED_CATALOG_MESSAGE);
  });

  it('update_cart with messages error does not set cartMutationSucceeded', async () => {
    vi.spyOn(mcpServer, 'callMcpToolDirect').mockImplementation(async (_e, name) => {
      if (name === 'get_cart') {
        return {result: presentCartForChat(FLAT_MCP_RESULT)};
      }
      return {
        result: presentCartForChat({
          structuredContent: {
            ...FLAT_UCP_STRUCTURED_CONTENT,
            messages: [{type: 'error', code: 'x', content: 'fail'}],
          },
        }),
      };
    });
    const updated = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'update_cart',
      argsJson: JSON.stringify({
        add_items: [{quantity: 1, item: {id: 'gid://shopify/ProductVariant/1'}}],
      }),
      sessionId: 'sess-err-2',
      sessionCartId: FLAT_UCP_STRUCTURED_CONTENT.id,
      allowedVariantIds: new Set(['gid://shopify/ProductVariant/1']),
    });
    expect(updated.cartMutationSucceeded).toBeFalsy();
    expect(
      applyCartMutationHistoryOverride(
        REPLY_LINK_REJECTED_CATALOG_MESSAGE,
        Boolean(updated.cartMutationSucceeded),
      ),
    ).toBe(REPLY_LINK_REJECTED_CATALOG_MESSAGE);
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

function toolCallStream(
  name: string,
  id: string,
  args = '{}',
): ReadableStream<aiClient.GroqStreamEvent> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({
        type: 'tool_call',
        call: {id, name, arguments: args},
      });
      controller.close();
    },
  });
}

function multiToolCallStream(
  calls: {name: string; id: string; args?: string}[],
): ReadableStream<aiClient.GroqStreamEvent> {
  return new ReadableStream({
    start(controller) {
      for (const c of calls) {
        controller.enqueue({
          type: 'tool_call',
          call: {id: c.id, name: c.name, arguments: c.args ?? '{}'},
        });
      }
      controller.close();
    },
  });
}

function textStream(text: string): ReadableStream<aiClient.GroqStreamEvent> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({type: 'text', delta: text});
      controller.close();
    },
  });
}

describe('compose: sessionCartId without mutation keeps catalog stub (P2-b)', () => {
  it('prior sessionCartId alone does not yield cart-updated note', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([
      'search_catalog',
      'ucp_cart',
    ]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    vi.spyOn(sessionHistory, 'readBuyerSessionHistory').mockResolvedValue([]);
    const appendSpy = vi
      .spyOn(sessionHistory, 'appendBuyerSessionMessage')
      .mockResolvedValue();
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(
      FLAT_UCP_STRUCTURED_CONTENT.id,
    );
    vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      result: presentCartForChat(FLAT_MCP_RESULT),
    });
    vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockResolvedValue({
      content: JSON.stringify({products: []}),
      // brak cartMutationSucceeded
    });
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue(
      'Nadal [zły](https://example.com/x).',
    );
    vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(
      async (_m, _e, _t, _s, timingLabel) => {
        if (timingLabel === 'buyer_tool_loop_0') {
          return toolCallStream('search_catalog', 'c1', '{"query":"pierścionek"}');
        }
        return textStream('Zobacz [X](https://example.com/foreign).');
      },
    );

    const env = {SHOP_DOMAIN: 'shop.myshopify.com'} as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', {method: 'POST'});
    const reply = await composeBuyerAssistantReply(
      env,
      'epir-online-store',
      'Szukam pierścionka',
      req,
      {sessionId: 'sess-prior-cart'},
    );

    expect(reply).toBe('Zobacz X.');
    expect(reply).not.toBe(REPLY_CART_LINK_REJECTED_AFTER_MUTATION_MESSAGE);
    const assistantAppend = appendSpy.mock.calls.find((c) => c[2] === 'assistant');
    expect(assistantAppend?.[3]).toBe('Zobacz X.');
  });
});

describe('compose: successful create_cart does not leave catalog stub for next turn (P2-c)', () => {
  it('turn A stores cart note; turn B history is not catalog stub', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([
      'search_catalog',
      'ucp_cart',
    ]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(null);
    vi.spyOn(sessionCart, 'writeSessionCartId').mockResolvedValue();
    vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      result: presentCartForChat(FLAT_MCP_RESULT),
    });

    const historyStore: {role: 'user' | 'assistant'; content: string}[] = [];
    vi.spyOn(sessionHistory, 'readBuyerSessionHistory').mockImplementation(async () => [
      ...historyStore,
    ]);
    vi.spyOn(sessionHistory, 'appendBuyerSessionMessage').mockImplementation(
      async (_env, _sid, role, content) => {
        historyStore.push({role, content});
      },
    );

    vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockImplementation(async (input) => {
      if (input.name === 'create_cart') {
        const presented = presentCartForChat(FLAT_MCP_RESULT);
        return {
          content: JSON.stringify(presented),
          sessionCartId: FLAT_UCP_STRUCTURED_CONTENT.id,
          cartMutationSucceeded: true,
          continueUrl: CONTINUE,
          cartMutationPayload: presented,
        };
      }
      return {content: JSON.stringify({products: []})};
    });
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue(
      'Nadal [zły](https://example.com/x).',
    );
    vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(
      async (_m, _e, _t, _s, timingLabel) => {
        if (timingLabel === 'buyer_tool_loop_0') {
          // search_catalog → stub katalogowy; create_cart → override na notatkę koszyka
          return multiToolCallStream([
            {
              name: 'search_catalog',
              id: 'c-search',
              args: '{"query":"pierścionek"}',
            },
            {
              name: 'create_cart',
              id: 'c-create',
              args: JSON.stringify({
                line_items: [{quantity: 1, item: {id: 'gid://shopify/ProductVariant/1'}}],
              }),
            },
          ]);
        }
        return textStream('Koszyk: [link](https://example.com/bad)');
      },
    );

    const env = {SHOP_DOMAIN: 'shop.myshopify.com'} as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', {method: 'POST'});

    const replyA = await composeBuyerAssistantReply(
      env,
      'epir-online-store',
      'Dodaj do koszyka',
      req,
      {sessionId: 'sess-p2c'},
    );
    const expectedCartReply = buildCartContinueReply({
      continueUrl: CONTINUE,
      cartPayload: presentCartForChat(FLAT_MCP_RESULT),
    });
    expect(replyA).toBe(expectedCartReply);
    expect(historyStore.some((h) => h.content === REPLY_LINK_REJECTED_CATALOG_MESSAGE)).toBe(
      false,
    );
    expect(historyStore.some((h) => h.content === expectedCartReply)).toBe(true);

    // Turn B: no cart mutation; history from A must not be catalog stub
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(
      FLAT_UCP_STRUCTURED_CONTENT.id,
    );
    vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockResolvedValue({
      content: '{"ok":true}',
    });
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue(
      'Kontynuacja bez ponownego wyboru wariantu.',
    );

    let turnBMessages: aiClient.GroqMessage[] = [];
    vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(async (messages) => {
      turnBMessages = messages as aiClient.GroqMessage[];
      return textStream('Kontynuacja bez ponownego wyboru wariantu.');
    });

    const replyB = await composeBuyerAssistantReply(
      env,
      'epir-online-store',
      'podaj status koszyka',
      req,
      {sessionId: 'sess-p2c'},
    );
    expect(replyB).toContain('Kontynuacja');
    const priorAssistant = turnBMessages.filter((m) => m.role === 'assistant');
    expect(
      priorAssistant.some(
        (m) =>
          typeof m.content === 'string' &&
          m.content === REPLY_LINK_REJECTED_CATALOG_MESSAGE,
      ),
    ).toBe(false);
    expect(
      priorAssistant.some(
        (m) =>
          typeof m.content === 'string' &&
          m.content.includes(CONTINUE) &&
          m.content.includes('Przejdź do koszyka'),
      ),
    ).toBe(true);
  });
});
