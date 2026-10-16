/**
 * E4 reply formatting — **M-E4-5** dwa continue_url → T-E4-CART-5 FAIL
 */
import {describe, expect, it} from 'vitest';
import {buildEpirActionReply} from '../../../src/gemma/actions/reply';
import {DEFAULT_GEMMA_SESSION_STATE} from '../../../src/gemma/state/types';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';

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
        catalogCards: [],
        kb: null,
        cart: null,
        productDetail: null,
        catalogFailed: false,
        kbFailed: false,
        cartFailed: false,
      },
    });
    expect(reply).not.toMatch(/checkout/i);
    expect(reply).toContain('epirbizuteria.pl');
  });
});
