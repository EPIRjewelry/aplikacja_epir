import {beforeEach, describe, expect, it, vi} from 'vitest';
import {composeBuyerAssistantReply} from '../src/buyer/compose-buyer-turn';
import * as toolReadiness from '../src/buyer/tool-readiness';
import * as aiProfile from '../src/ai-profile';
import * as aiClient from '../src/ai-client';
import * as sessionHistory from '../src/buyer/session-history';
import * as sessionCart from '../src/buyer/session-cart';
import * as executeBuyerToolMod from '../src/buyer/execute-buyer-tool';
import {buildCartContinueReply} from '../src/buyer/cart-continue-reply';

// Probe: compose uses this string — keep in sync if renamed
const FALLBACK = 'Nie udało się wykonać operacji, proszę spróbować ponownie.';

beforeEach(() => {
  vi.restoreAllMocks();
});

function textStream(text: string): ReadableStream<aiClient.GroqStreamEvent> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({type: 'text', delta: text});
      controller.close();
    },
  });
}

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

describe('compose blocks tool-as-text JSON from client', () => {
  it('does not return action:update_cart JSON to the client', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([
      'search_catalog',
      'ucp_cart',
    ]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    vi.spyOn(sessionHistory, 'readBuyerSessionHistory').mockResolvedValue([]);
    vi.spyOn(sessionHistory, 'appendBuyerSessionMessage').mockResolvedValue();
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(
      'gid://shopify/Cart/abc',
    );
    vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockResolvedValue({
      content: '{"ok":true}',
    });

    let forceAttempt = 0;
    vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(
      async (_m, _e, _t, _s, timingLabel, opts) => {
        if (opts?.toolChoice && typeof opts.toolChoice === 'object') {
          forceAttempt += 1;
          // forced round still fails to emit tool_calls → finalize fallback
          return textStream('nadal bez narzędzia');
        }
        if (String(timingLabel).includes('buyer_tool_loop_0')) {
          return textStream(
            JSON.stringify({
              action: 'update_cart',
              cart_id: 'gid://shopify/Cart/abc',
              line_items: [{id: 'li', quantity: 2}],
            }),
          );
        }
        return textStream('ok');
      },
    );
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue(FALLBACK);

    const env = {SHOP_DOMAIN: 'shop.myshopify.com'} as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', {method: 'POST'});
    const reply = await composeBuyerAssistantReply(
      env,
      'epir-online-store',
      'zmień ilość na 2',
      req,
      {sessionId: 'sess-json'},
    );
    expect(reply).not.toContain('"action"');
    expect(reply).not.toContain('update_cart');
    expect(reply).toBe(FALLBACK);
    expect(forceAttempt).toBeGreaterThanOrEqual(1);
  });

  it('after successful cart mutation + empty guard retry returns exact continue_url', async () => {
    const continueUrl =
      'https://epir-art-silver-jewellery.myshopify.com/cart/c/EXACTTOKEN';
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([
      'search_catalog',
      'ucp_cart',
    ]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    vi.spyOn(sessionHistory, 'readBuyerSessionHistory').mockResolvedValue([]);
    vi.spyOn(sessionHistory, 'appendBuyerSessionMessage').mockResolvedValue();
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(null);
    vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockResolvedValue({
      content: JSON.stringify({
        continue_url: continueUrl,
        cart_id: 'gid://shopify/Cart/1',
        messages: [{type: 'warning', code: 'quantity_adjusted', content: 'Dostosowano ilość'}],
        totals: [{type: 'total', amount: 5000, display_pl: '50 zł'}],
      }),
      sessionCartId: 'gid://shopify/Cart/1',
      cartMutationSucceeded: true,
      continueUrl,
      cartNotices: ['Dostosowano ilość'],
      cartTotalsNote: 'Suma szacunkowa: 50 zł (ostateczna kwota w kasie).',
    });
    vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(
      async (_m, _e, _t, _s, timingLabel) => {
        if (timingLabel === 'buyer_tool_loop_0') {
          return toolCallStream(
            'create_cart',
            'c1',
            JSON.stringify({
              line_items: [{quantity: 1, item: {id: 'gid://shopify/ProductVariant/1'}}],
            }),
          );
        }
        return textStream(`Zły [link](https://example.com/x)`);
      },
    );
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('');

    const env = {SHOP_DOMAIN: 'shop.myshopify.com'} as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', {method: 'POST'});
    const reply = await composeBuyerAssistantReply(
      env,
      'epir-online-store',
      'Dodaj do koszyka',
      req,
      {sessionId: 'sess-cont'},
    );
    expect(reply).toBe(
      buildCartContinueReply(
        continueUrl,
        ['Dostosowano ilość'],
        'Suma szacunkowa: 50 zł (ostateczna kwota w kasie).',
      ),
    );
    expect(reply).toContain(continueUrl);
    expect(reply).not.toContain('utm_');
  });
});
