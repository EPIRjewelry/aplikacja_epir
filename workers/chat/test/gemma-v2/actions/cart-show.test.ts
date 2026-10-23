/**
 * E5 cart show — mutacja M-E5-8
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {formatCartShowBodyFromToolContent} from '../../../src/gemma/actions/cart';
import {composeGemmaReply} from '../../../src/gemma/compose-gemma-reply';
import {makeTrackedSessionNamespace} from '../helpers/session-do-calls';
import {stubGemmaIntentJson} from '../helpers/stub-gemma-intent';
import * as execute from '../../../src/buyer/execute-buyer-tool';
import * as toolReadiness from '../../../src/buyer/tool-readiness';
import * as sessionCart from '../../../src/buyer/session-cart';

const fictionalCartContent = JSON.stringify({
  cart: {
    line_items: [
      {
        quantity: 1,
        item: {
          title: 'Fikcyjny pierścionek testowy',
          price: 150_000,
          currency: 'PLN',
        },
      },
    ],
    totals: [{type: 'total', amount: 150_000, currency: 'PLN'}],
  },
});

describe('E5 cart show', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-E5-CART-SHOW-1: show renders line from fixture payload', () => {
    const body = formatCartShowBodyFromToolContent(fictionalCartContent);
    expect(body).toContain('Fikcyjny pierścionek testowy');
  });

  it('T-E5-CART-SHOW-2: show reply has no technical block or gid or checkout url', async () => {
    await stubGemmaIntentJson({state: 'koszyk', cart_action: 'show', cart_consent: true});
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue(['ucp_cart']);
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue('cart_fikcyjny');
    vi.spyOn(execute, 'executeBuyerTool').mockResolvedValue({
      content: fictionalCartContent,
    } as never);
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'pokaż koszyk',
      new Request('https://example.com'),
      {sessionId: 'sess_e5_show_2'},
    );
    // Pozycja z koszyka musi dotrzeć do odpowiedzi (nie tylko do formattera).
    expect(reply).toContain('Fikcyjny pierścionek testowy');
    expect(reply).not.toContain('DANE TECHNICZNE');
    expect(reply).not.toContain('gid://');
    expect(reply.toLowerCase()).not.toContain('continue_url');
    expect(reply.toLowerCase()).not.toContain('checkout');
  });
});
