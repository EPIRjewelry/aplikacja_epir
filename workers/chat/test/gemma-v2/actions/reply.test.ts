/**
 * E4 reply formatting — **M-E4-5** dwa continue_url → T-E4-CART-5b FAIL
 */
import {describe, expect, it} from 'vitest';
import {buildEpirActionReply} from '../../../src/gemma/actions/reply';
import {DEFAULT_GEMMA_SESSION_STATE} from '../../../src/gemma/state/types';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';
import {fictionalMatchFromProduct, fictionalMultiVariantProduct} from '../fixtures/fictional-catalog-products';

describe('E4 action reply', () => {
  it('T-E4-LINK-1: propozycje without cart has no checkout URL', () => {
    const reply = buildEpirActionReply({
      channelId: 'epir-online-store',
      state: 'propozycje',
      intent: fictionalGemmaIntent(),
      outcome: {
        shown: [
          {
            ref: 'g1',
            productId: 'gid://shopify/Product/900001',
            handle: 'fikcyjny-pierscionek-parity',
            variantIds: [],
            url: 'https://epirbizuteria.pl/products/fikcyjny-pierscionek-parity',
          },
        ],
        selected: null,
        catalogCards: [
          {ref: 'g1', match: fictionalMatchFromProduct(fictionalMultiVariantProduct()), minMinor: 120_000},
        ],
        kb: null,
        cart: null,
        productDetail: null,
        catalogFailed: false,
        kbFailed: false,
        cartFailed: false,
      },
    });
    expect(reply).not.toMatch(/checkout/i);
    expect(reply).toContain('https://epirbizuteria.pl/products/fikcyjny-pierscionek-parity');
  });

  it('T-E4-CART-5b: successful mutation → exactly one checkout URL in the reply', () => {
    const url = 'https://checkout.example.test/cart/c1';
    const reply = buildEpirActionReply({
      channelId: 'epir-online-store',
      state: 'koszyk',
      intent: fictionalGemmaIntent({cart_action: 'add', cart_consent: true}),
      outcome: {
        shown: [],
        selected: null,
        catalogCards: [],
        kb: null,
        cart: {continueUrl: url, notices: []},
        productDetail: null,
        catalogFailed: false,
        kbFailed: false,
        cartFailed: false,
      },
    });
    expect(reply.split(url).length - 1).toBe(1);
  });
});
