/**
 * E4 cart guards.
 * - **M-E4-2** — execute przy consent false → T-E4-CART-1 FAIL
 * - **M-E4-3** — gemma woła callMcpToolDirect update_cart poza execute → CART-3/CART-6 FAIL
 * - **M-E4-4** — ignoruj messages error → T-E4-CART-4 FAIL
 * - **M-E4-5** — dwa continue_url → T-E4-CART-5 FAIL
 * - **M-E4-11** — mutacja przy nierozstrzygniętym wariancie → T-E4-CART-7 FAIL
 * - **M-E4-12** — remove mutuje → T-E4-CART-8 FAIL
 * - **M-E4-13** — show daje continue_url → T-E4-CART-9 FAIL
 * - **M-E4-15** — selected przed product_ref → T-E4-CART-10 FAIL
 * - **M-E4-16** — auto-wybór jedynego dostępnego z wielu wariantów → T-E4-CART-11 FAIL
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {runCartAction, formatCartMutationReply} from '../../../src/gemma/actions/cart';
import {buildEpirActionReply} from '../../../src/gemma/actions/reply';
import {fictionalMultiVariantProduct} from '../fixtures/fictional-catalog-products';
import {DEFAULT_GEMMA_SESSION_STATE} from '../../../src/gemma/state/types';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';
import * as execute from '../../../src/buyer/execute-buyer-tool';
import * as mcp from '../../../src/mcp_server';

const baseCtx = {
  env: {} as never,
  channelId: 'epir-online-store' as const,
  request: new Request('https://example.com'),
  sessionId: 'sess_e4_cart',
  userText: 'fikcyjne',
  userCorpus: 'fikcyjne',
  prev: {
    ...DEFAULT_GEMMA_SESSION_STATE,
    shown: [
      {
        ref: 'g1',
        productId: 'gid://shopify/Product/900001',
        handle: 'fikcyjny-pierscionek-parity',
        variantIds: ['gid://shopify/ProductVariant/900001-c'],
        url: '/products/fikcyjny-pierscionek-parity',
      },
    ],
  },
  transitioned: {
    nextState: 'koszyk' as const,
    slots: {},
    allowedActions: ['cart' as const],
  },
};

describe('E4 cart action', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-E4-CART-1: consent false → zero executeBuyerTool', async () => {
    const spy = vi.spyOn(execute, 'executeBuyerTool');
    const out = await runCartAction({
      ...baseCtx,
      intent: fictionalGemmaIntent({cart_action: 'add', cart_consent: false, product_ref: 'g1'}),
    });
    expect(out.needsConsent).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('T-E4-CART-2: consent true → executeBuyerTool called once', async () => {
    const facts = await import('../../../src/facts');
    vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue({
      ...(await import('../fixtures/fictional-catalog-products')).fictionalMultiVariantProduct(),
    });
    const ready = await import('../../../src/buyer/tool-readiness');
    vi.spyOn(ready, 'listAvailableBuyerTools').mockResolvedValue(['ucp_cart']);
    const sessionCart = await import('../../../src/buyer/session-cart');
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(null);
    const spy = vi.spyOn(execute, 'executeBuyerTool').mockResolvedValue({
      content: '{}',
      cartMutationSucceeded: true,
      continueUrl: 'https://checkout.example.test/cart',
    });
    await runCartAction({
      ...baseCtx,
      intent: fictionalGemmaIntent({
        cart_action: 'add',
        cart_consent: true,
        product_ref: 'g1',
        variant_choice: 'gid://shopify/ProductVariant/900001-c',
      }),
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('T-E4-CART-3: update_cart path uses get_cart inside executeBuyerTool', async () => {
    const mcpSpy = vi.spyOn(mcp, 'callMcpToolDirect').mockImplementation(async (_env, name) => {
      if (name === 'get_cart') return {result: {cart: {id: 'c1', lines: []}}};
      return {result: {cart: {id: 'c1'}}};
    });
    const facts = await import('../../../src/facts');
    vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue(
      (await import('../fixtures/fictional-catalog-products')).fictionalMultiVariantProduct(),
    );
    vi.spyOn(await import('../../../src/buyer/tool-readiness'), 'listAvailableBuyerTools').mockResolvedValue([
      'ucp_cart',
    ]);
    vi.spyOn(await import('../../../src/buyer/session-cart'), 'readSessionCartId').mockResolvedValue('cart-1');
    vi.spyOn(execute, 'executeBuyerTool').mockImplementation(async (input) => {
      if (input.name === 'update_cart') {
        await mcp.callMcpToolDirect(input.env, 'get_cart', {}, {} as never);
        await mcp.callMcpToolDirect(input.env, 'update_cart', {}, {} as never);
      }
      return {content: '{}', cartMutationSucceeded: true, continueUrl: 'https://checkout.example.test/one'};
    });
    await runCartAction({
      ...baseCtx,
      intent: fictionalGemmaIntent({
        cart_action: 'add',
        cart_consent: true,
        product_ref: 'g1',
        variant_choice: 'gid://shopify/ProductVariant/900001-c',
      }),
    });
    const names = mcpSpy.mock.calls.map((c) => c[1]);
    expect(names.filter((n) => n === 'get_cart').length).toBeGreaterThanOrEqual(1);
    expect(names.includes('update_cart')).toBe(true);
  });

  it('T-E4-CART-4: messages error → no continue_url in formatted reply', () => {
    const text = formatCartMutationReply({clientErrors: ['Błąd koszyka']});
    expect(text).toBeNull();
  });

  it('T-E4-CART-5: single continue_url in buildCartContinueReply output', () => {
    const text = formatCartMutationReply({
      continueUrl: 'https://checkout.example.test/cart',
      notices: [],
    });
    expect(text).toBeTruthy();
    expect(text!.match(/https:\/\/checkout\.example\.test\/cart/g)?.length).toBe(1);
  });

  it('T-E4-CART-6: gemma does not call get_cart directly (only via execute)', async () => {
    const mcpSpy = vi.spyOn(mcp, 'callMcpToolDirect');
    const facts = await import('../../../src/facts');
    vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue(
      (await import('../fixtures/fictional-catalog-products')).fictionalMultiVariantProduct(),
    );
    vi.spyOn(await import('../../../src/buyer/tool-readiness'), 'listAvailableBuyerTools').mockResolvedValue([
      'ucp_cart',
    ]);
    vi.spyOn(await import('../../../src/buyer/session-cart'), 'readSessionCartId').mockResolvedValue('cart-1');
    vi.spyOn(execute, 'executeBuyerTool').mockResolvedValue({
      content: '{}',
      cartMutationSucceeded: true,
      continueUrl: 'https://checkout.example.test/cart',
    });
    await runCartAction({
      ...baseCtx,
      intent: fictionalGemmaIntent({
        cart_action: 'add',
        cart_consent: true,
        product_ref: 'g1',
        variant_choice: 'gid://shopify/ProductVariant/900001-c',
      }),
    });
    const directGet = mcpSpy.mock.calls.filter((c) => c[1] === 'get_cart');
    expect(directGet.length).toBe(0);
  });

  it('T-E4-CART-7: unresolved variant → zero executeBuyerTool', async () => {
    const facts = await import('../../../src/facts');
    vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue(
      (await import('../fixtures/fictional-catalog-products')).fictionalMultiVariantProduct(),
    );
    const spy = vi.spyOn(execute, 'executeBuyerTool');
    const out = await runCartAction({
      ...baseCtx,
      intent: fictionalGemmaIntent({cart_action: 'add', cart_consent: true, product_ref: 'g1'}),
    });
    expect(out.variantUnresolved).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('T-E4-CART-8: remove does not mutate cart (even with consent and resolvable variant)', async () => {
    await stubCartDeps();
    const spy = vi.spyOn(execute, 'executeBuyerTool').mockResolvedValue({content: '{}'});
    await runCartAction({
      ...baseCtx,
      intent: fictionalGemmaIntent({
        cart_action: 'remove',
        cart_consent: true,
        product_ref: 'g1',
        variant_choice: 'gid://shopify/ProductVariant/900001-c',
      }),
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('T-E4-CART-9: show does not attach continue_url', async () => {
    vi.spyOn(await import('../../../src/buyer/tool-readiness'), 'listAvailableBuyerTools').mockResolvedValue([
      'ucp_cart',
    ]);
    vi.spyOn(await import('../../../src/buyer/session-cart'), 'readSessionCartId').mockResolvedValue('cart-1');
    vi.spyOn(execute, 'executeBuyerTool').mockResolvedValue({
      content: '{"continue_url":"https://checkout.example.test/hidden"}',
    });
    const out = await runCartAction({
      ...baseCtx,
      intent: fictionalGemmaIntent({cart_action: 'show', cart_consent: true}),
    });
    expect(out.continueUrl).toBeUndefined();
    expect(formatCartMutationReply(out)).toBeNull();
  });

  async function stubCartDeps(product = fictionalMultiVariantProduct(), cartId: string | null = 'cart-1') {
    const facts = await import('../../../src/facts');
    const fetchSpy = vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue(product);
    vi.spyOn(await import('../../../src/buyer/tool-readiness'), 'listAvailableBuyerTools').mockResolvedValue([
      'ucp_cart',
    ]);
    vi.spyOn(await import('../../../src/buyer/session-cart'), 'readSessionCartId').mockResolvedValue(cartId);
    return fetchSpy;
  }

  it('T-E4-CART-4b: Cart MCP messages error → reply carries shop message, no checkout URL', async () => {
    await stubCartDeps();
    vi.spyOn(execute, 'executeBuyerTool').mockResolvedValue({
      content: '{}',
      cartClientErrors: ['Fikcyjny komunikat sklepu o braku wariantu.'],
    });
    const intent = fictionalGemmaIntent({
      cart_action: 'add',
      cart_consent: true,
      product_ref: 'g1',
      variant_choice: 'gid://shopify/ProductVariant/900001-c',
    });
    const cart = await runCartAction({...baseCtx, intent});
    const reply = buildEpirActionReply({
      channelId: 'epir-online-store',
      state: 'koszyk',
      intent,
      outcome: {
        shown: baseCtx.prev.shown,
        selected: null,
        catalogCards: [],
        kb: null,
        cart,
        productDetail: null,
        catalogFailed: false,
        kbOutcome: 'ok',
        cartFailed: false,
      },
    });
    expect(reply).toContain('Fikcyjny komunikat sklepu o braku wariantu.');
    expect(reply).not.toMatch(/checkout/i);
  });

  it('T-E4-CART-6b: one mutation per turn, only through executeBuyerTool (D3)', async () => {
    const mcpSpy = vi.spyOn(mcp, 'callMcpToolDirect');
    await stubCartDeps();
    const execSpy = vi.spyOn(execute, 'executeBuyerTool').mockResolvedValue({
      content: '{}',
      cartMutationSucceeded: true,
      continueUrl: 'https://checkout.example.test/cart',
    });
    await runCartAction({
      ...baseCtx,
      intent: fictionalGemmaIntent({
        cart_action: 'add',
        cart_consent: true,
        product_ref: 'g1',
        variant_choice: 'gid://shopify/ProductVariant/900001-c',
      }),
    });
    expect(mcpSpy).not.toHaveBeenCalled();
    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(execSpy.mock.calls[0]![0].name).toBe('update_cart');
  });

  it('T-E4-CART-10: explicit product_ref wins over selected from session', async () => {
    const other = {
      ...fictionalMultiVariantProduct(),
      productId: 'gid://shopify/Product/900009',
      handle: 'fikcyjny-inny-model',
    };
    const fetchSpy = await stubCartDeps();
    vi.spyOn(execute, 'executeBuyerTool').mockResolvedValue({content: '{}'});
    await runCartAction({
      ...baseCtx,
      prev: {
        ...baseCtx.prev,
        shown: [
          ...baseCtx.prev.shown,
          {ref: 'g2', productId: other.productId, handle: other.handle, variantIds: [], url: '/products/fikcyjny-inny-model'},
        ],
        selected: {productId: other.productId, variantId: null},
      },
      intent: fictionalGemmaIntent({
        cart_action: 'add',
        cart_consent: true,
        product_ref: 'g1',
        variant_choice: 'gid://shopify/ProductVariant/900001-c',
      }),
    });
    expect(fetchSpy.mock.calls[0]![2]).toBe('fikcyjny-pierscionek-parity');
  });

  it('T-E4-CART-11: only one available of many variants is not the customer choice', async () => {
    const product = fictionalMultiVariantProduct();
    product.variants = product.variants.map((v, i) => ({...v, available: i === 0}));
    await stubCartDeps(product);
    const spy = vi.spyOn(execute, 'executeBuyerTool');
    const out = await runCartAction({
      ...baseCtx,
      intent: fictionalGemmaIntent({cart_action: 'add', cart_consent: true, product_ref: 'g1'}),
    });
    expect(out.variantUnresolved).toBe(true);
    expect(out.productUrl).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });
});
