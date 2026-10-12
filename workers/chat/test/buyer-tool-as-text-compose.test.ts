import {beforeEach, describe, expect, it, vi} from 'vitest';
import {composeBuyerAssistantReply} from '../src/buyer/compose-buyer-turn';
import * as toolReadiness from '../src/buyer/tool-readiness';
import * as aiProfile from '../src/ai-profile';
import * as aiClient from '../src/ai-client';
import * as sessionHistory from '../src/buyer/session-history';
import * as sessionCart from '../src/buyer/session-cart';
import * as executeBuyerToolMod from '../src/buyer/execute-buyer-tool';
import * as mcpServer from '../src/mcp_server';
import {
  buildCartContinueReply,
  mergeModelTextWithCartBlock,
} from '../src/buyer/cart-continue-reply';
import {ASK_VARIANT_BEFORE_CART_MESSAGE} from '../src/buyer/tool-as-text';

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

function mockComposeBasics(): void {
  vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([
    'search_catalog',
    'ucp_cart',
  ]);
  vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
  vi.spyOn(sessionHistory, 'readBuyerSessionHistory').mockResolvedValue([]);
  vi.spyOn(sessionHistory, 'appendBuyerSessionMessage').mockResolvedValue();
}

describe('compose: tool_choice force rules after PR #167 follow-up', () => {
  it('„jak dodać do koszyka?” does not force create_cart/update_cart', async () => {
    mockComposeBasics();
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(null);
    vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockResolvedValue({
      content: '{"ok":true}',
    });

    const forceNames: string[] = [];
    vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(
      async (_m, _e, _t, _s, _label, opts) => {
        if (opts?.toolChoice && typeof opts.toolChoice === 'object') {
          forceNames.push(opts.toolChoice.function.name);
        }
        return textStream(
          'Można dodać produkt po wyborze rozmiaru — napisz, który wariant.',
        );
      },
    );
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('ok');

    const env = {SHOP_DOMAIN: 'shop.myshopify.com'} as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', {method: 'POST'});
    const reply = await composeBuyerAssistantReply(
      env,
      'epir-online-store',
      'jak dodać do koszyka?',
      req,
      {sessionId: 'sess-how'},
    );
    expect(forceNames).not.toContain('create_cart');
    expect(forceNames).not.toContain('update_cart');
    expect(reply).not.toMatch(/create_cart|update_cart/);
  });

  it('tool-as-text create_cart without size/variant asks client — no create_cart force', async () => {
    mockComposeBasics();
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(null);
    const execSpy = vi
      .spyOn(executeBuyerToolMod, 'executeBuyerTool')
      .mockResolvedValue({content: '{"ok":true}'});

    const forceNames: string[] = [];
    vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(
      async (_m, _e, _t, _s, _label, opts) => {
        if (opts?.toolChoice && typeof opts.toolChoice === 'object') {
          forceNames.push(opts.toolChoice.function.name);
          return toolCallStream('create_cart', 'forced');
        }
        return textStream(
          JSON.stringify({
            action: 'create_cart',
            line_items: [{quantity: 1}],
          }),
        );
      },
    );
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('x');

    const env = {SHOP_DOMAIN: 'shop.myshopify.com'} as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', {method: 'POST'});
    const reply = await composeBuyerAssistantReply(
      env,
      'epir-online-store',
      'dodaj ten pierścionek',
      req,
      {sessionId: 'sess-nosize'},
    );
    expect(forceNames).not.toContain('create_cart');
    expect(execSpy).not.toHaveBeenCalled();
    expect(reply).toBe(ASK_VARIANT_BEFORE_CART_MESSAGE);
    expect(reply).not.toContain('"action"');
  });

  it('tool-as-text update_cart without ProductVariant does not force; asks variant', async () => {
    mockComposeBasics();
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(
      'gid://shopify/Cart/abc',
    );
    vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      result: {id: 'gid://shopify/Cart/abc', line_items: [], continue_url: 'https://x'},
    });
    vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockResolvedValue({
      content: '{"ok":true}',
    });

    let forceAttempt = 0;
    vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(
      async (_m, _e, _t, _s, _label, opts) => {
        if (opts?.toolChoice && typeof opts.toolChoice === 'object') {
          forceAttempt += 1;
          return textStream('nadal bez narzędzia');
        }
        return textStream(
          JSON.stringify({
            action: 'update_cart',
            cart_id: 'gid://shopify/Cart/abc',
            line_items: [{id: 'li', quantity: 2}],
          }),
        );
      },
    );
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('x');

    const env = {SHOP_DOMAIN: 'shop.myshopify.com'} as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', {method: 'POST'});
    const reply = await composeBuyerAssistantReply(
      env,
      'epir-online-store',
      'zmień ilość na 2',
      req,
      {sessionId: 'sess-json'},
    );
    expect(forceAttempt).toBe(0);
    expect(reply).toBe(ASK_VARIANT_BEFORE_CART_MESSAGE);
    expect(reply).not.toContain('update_cart');
  });

  it('after successful cart mutation always ends with deterministic cart block', async () => {
    const continueUrl =
      'https://epir-art-silver-jewellery.myshopify.com/cart/c/EXACTTOKEN';
    const cartPayload = {
      continue_url: continueUrl,
      cart_id: 'gid://shopify/Cart/1',
      line_items: [
        {
          quantity: 2,
          item: {
            id: 'gid://shopify/ProductVariant/1',
            title: 'Pierścionek Aurora',
            selected_options: [{name: 'Rozmiar', value: '18'}],
          },
        },
      ],
      messages: [
        {type: 'warning', code: 'quantity_adjusted', content: 'Dostosowano ilość'},
      ],
      totals: [{type: 'total', amount: 5000, display_pl: '50 zł'}],
    };
    mockComposeBasics();
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(null);
    vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockResolvedValue({
      content: JSON.stringify(cartPayload),
      sessionCartId: 'gid://shopify/Cart/1',
      cartMutationSucceeded: true,
      continueUrl,
      cartNotices: ['Dostosowano ilość'],
      cartTotalsNote: 'Suma szacunkowa: 50 zł (ostateczna kwota w kasie).',
      cartMutationPayload: cartPayload,
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
        return textStream('Koszyk jest gotowy.');
      },
    );
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('x');

    const env = {SHOP_DOMAIN: 'shop.myshopify.com'} as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', {method: 'POST'});
    const reply = await composeBuyerAssistantReply(
      env,
      'epir-online-store',
      'Dodaj do koszyka',
      req,
      {sessionId: 'sess-append'},
    );
    const block = buildCartContinueReply({
      continueUrl,
      notices: ['Dostosowano ilość'],
      totalsNote: 'Suma szacunkowa: 50 zł (ostateczna kwota w kasie).',
      cartPayload,
    });
    expect(reply).toBe(mergeModelTextWithCartBlock('Koszyk jest gotowy.', block, continueUrl, cartPayload));
    expect(reply).toContain('Pierścionek Aurora');
    expect(reply).toContain('2 szt.');
    expect(reply).toContain('Dostosowano ilość');
    expect(reply).toContain(continueUrl);
    expect(reply).not.toContain('utm_');
  });

  it('without mutation this turn does not inject cart link', async () => {
    mockComposeBasics();
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(
      'gid://shopify/Cart/prior',
    );
    vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      result: {
        id: 'gid://shopify/Cart/prior',
        line_items: [],
        continue_url: 'https://shop.myshopify.com/cart/c/PRIOR',
      },
    });
    vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockResolvedValue({
      content: '{"products":[]}',
    });
    vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(async () =>
      textStream('Oto propozycje bez koszyka.'),
    );
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('x');

    const env = {SHOP_DOMAIN: 'shop.myshopify.com'} as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', {method: 'POST'});
    const reply = await composeBuyerAssistantReply(
      env,
      'epir-online-store',
      'szukam pierścionka',
      req,
      {sessionId: 'sess-nomut'},
    );
    expect(reply).toBe('Oto propozycje bez koszyka.');
    expect(reply).not.toMatch(/\/cart\/c\//);
  });

  it('appends Shopify warning when model already included continue_url', async () => {
    const continueUrl =
      'https://epir-art-silver-jewellery.myshopify.com/cart/c/EXACTTOKEN';
    mockComposeBasics();
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(null);
    vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockResolvedValue({
      content: JSON.stringify({continue_url: continueUrl, cart_id: 'gid://shopify/Cart/1'}),
      sessionCartId: 'gid://shopify/Cart/1',
      cartMutationSucceeded: true,
      continueUrl,
      cartNotices: ['Dostosowano ilość'],
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
        return textStream(`Gotowe: [koszyk](${continueUrl})`);
      },
    );
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('x');

    const env = {SHOP_DOMAIN: 'shop.myshopify.com'} as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', {method: 'POST'});
    const reply = await composeBuyerAssistantReply(
      env,
      'epir-online-store',
      'Dodaj',
      req,
      {sessionId: 'sess-warn'},
    );
    expect(reply).toContain(continueUrl);
    expect(reply).toContain('Dostosowano ilość');
  });

  it('forced get_cart tool_choice 400 → neutral fallback without JSON', async () => {
    mockComposeBasics();
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(
      'gid://shopify/Cart/abc',
    );
    vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      result: {id: 'gid://shopify/Cart/abc', line_items: [], continue_url: 'https://x'},
    });
    vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockResolvedValue({
      content: '{"ok":true}',
    });

    vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(
      async (_m, _e, _t, _s, _label, opts) => {
        if (opts?.toolChoice && typeof opts.toolChoice === 'object') {
          throw new Error(
            'AI Gateway stream error event from Groq: 400 tool_use_failed',
          );
        }
        return textStream('Oto koszyk bez narzędzia.');
      },
    );
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('x');

    const env = {SHOP_DOMAIN: 'shop.myshopify.com'} as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/chat', {method: 'POST'});
    const reply = await composeBuyerAssistantReply(
      env,
      'epir-online-store',
      'pokaż koszyk',
      req,
      {sessionId: 'sess-400'},
    );
    expect(reply).toBe(
      'Nie udało się wykonać operacji, proszę spróbować ponownie.',
    );
    expect(reply).not.toContain('{');
    expect(reply).not.toMatch(/create_cart|update_cart|get_cart/);
  });

  it('after successful cart mutation + empty guard retry returns exact continue_url', async () => {
    const continueUrl =
      'https://epir-art-silver-jewellery.myshopify.com/cart/c/EXACTTOKEN';
    mockComposeBasics();
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(null);
    vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockResolvedValue({
      content: JSON.stringify({
        continue_url: continueUrl,
        cart_id: 'gid://shopify/Cart/1',
        messages: [
          {type: 'warning', code: 'quantity_adjusted', content: 'Dostosowano ilość'},
        ],
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
    const block = buildCartContinueReply(
      continueUrl,
      ['Dostosowano ilość'],
      'Suma szacunkowa: 50 zł (ostateczna kwota w kasie).',
    );
    expect(reply).toBe(mergeModelTextWithCartBlock('Zły link', block, continueUrl));
    expect(reply).toContain(continueUrl);
    expect(reply).not.toContain('utm_');
  });
});
