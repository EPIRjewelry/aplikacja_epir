/**
 * D-Q1 / D-Q2 (audyt aaffdb6) — znaczniki intencji A, koszyk po [NZ], sort tanio.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {composeGemmaReply} from '../../../src/gemma/compose-gemma-reply';
import * as catalogSearch from '../../../src/gemma/facts/catalog-search';
import * as facts from '../../../src/facts';
import * as mcpServer from '../../../src/mcp_server';
import {budgetMinorFromSlots} from '../../../src/gemma/actions/slots-to-filters';
import {fetchGemmaCatalogMatchesForTurn} from '../../../src/gemma/facts/catalog-fetch-for-turn';
import {transitionGemmaState} from '../../../src/gemma/state/machine';
import {DEFAULT_GEMMA_SESSION_STATE} from '../../../src/gemma/state/types';
import {
  epirCartProductQuestionReply,
  epirCatalogEmptyReply,
} from '../../../src/gemma/profiles/epir';
import {
  fictionalMatchFromProduct,
  fictionalMultiVariantProduct,
} from '../fixtures/fictional-catalog-products';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';
import {makeTrackedSessionNamespace} from '../helpers/session-do-calls';
import {stubGemmaGroqCalls} from '../helpers/stub-gemma-groq';
import {moneyFromMinor} from '../../../src/facts/types';

describe('D-Q1 — znaczniki intencji A', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-D-Q1-a: prezent w podziękowaniu → search, tekst UCP bez „podziękowanie”', async () => {
    const searchSpy = vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([]);
    await stubGemmaGroqCalls({
      intent: {
        state: 'propozycje',
        slots: {
          product_type: 'bransoletka',
          recipient: 'nauczycielka',
          occasion: 'podziękowanie',
        },
      },
    });
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'bransoletka dla nauczycielki w podziękowaniu',
      new Request('https://example.com'),
      {sessionId: 'sess_dq1_a'},
    );
    expect(searchSpy).toHaveBeenCalled();
    const filters = searchSpy.mock.calls[0]?.[2] as {text?: string};
    expect(filters.text ?? '').not.toMatch(/podziękowanie/i);
    expect(filters.text).toMatch(/bransoletka/i);
  });

  it('T-D-Q1-b: zamówienie indywidualne, potem złoto — UCP bez znacznika custom', async () => {
    const searchSpy = vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([]);
    const ai = await import('../../../src/ai-client');
    let turn = 0;
    vi.spyOn(ai, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') {
        turn += 1;
        if (turn === 1) {
          return JSON.stringify(
            fictionalGemmaIntent({
              state: 'propozycje',
              slots: {product_type: 'zamówienie indywidualne'},
            }),
          );
        }
        return JSON.stringify(
          fictionalGemmaIntent({
            state: 'propozycje',
            slots: {product_type: 'pierścionek', metal: 'złoto'},
          }),
        );
      }
      return JSON.stringify({text: 'Polecam {{g1}}.', product_refs: ['g1']});
    });
    const {namespace} = makeTrackedSessionNamespace();
    const sid = 'sess_dq1_b';
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'chcę zamówienie indywidualne ze złota',
      new Request('https://example.com'),
      {sessionId: sid},
    );
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'a coś złotego?',
      new Request('https://example.com'),
      {sessionId: sid},
    );
    expect(searchSpy).toHaveBeenCalled();
    const lastFilters = searchSpy.mock.calls.at(-1)?.[2] as {text?: string};
    expect(lastFilters.text ?? '').not.toMatch(/zamówienie indywidualne/i);
    expect(lastFilters.text).toMatch(/złoto/i);
  });

  it('T-D-Q1-c: samo „dzięki” — brak search (R04.2)', async () => {
    const searchSpy = vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([]);
    await stubGemmaGroqCalls({
      intent: {
        state: 'powitanie',
        slots: {occasion: 'podziękowanie', budget_qualitative: 'tanio'},
      },
    });
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'dzięki',
      new Request('https://example.com'),
      {sessionId: 'sess_dq1_c'},
    );
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('T-D-Q1-machine: podziękowanie ze slotami produktowymi → propozycje + search', () => {
    const out = transitionGemmaState(
      DEFAULT_GEMMA_SESSION_STATE,
      fictionalGemmaIntent({
        slots: {
          product_type: 'bransoletka',
          recipient: 'nauczycielka',
          occasion: 'podziękowanie',
        },
      }),
    );
    expect(out.nextState).toBe('propozycje');
    expect(out.allowedActions).toContain('search_catalog');
  });
});

describe('D-Q2 — koszyk bez shown po [NZ]', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-D-Z8-1: lista → [NZ] → koszyk — brak cart MCP, szablon produktu', async () => {
    const cheap = fictionalMultiVariantProduct();
    cheap.title = 'Fikcyjny koszyk A';
    const productSpy = vi.spyOn(facts, 'fetchProductFactsByHandle');
    vi.spyOn(catalogSearch, 'searchGemmaCatalog')
      .mockResolvedValueOnce([fictionalMatchFromProduct(cheap)])
      .mockResolvedValueOnce([]);

    const ai = await import('../../../src/ai-client');
    let intentTurn = 0;
    vi.spyOn(ai, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') {
        intentTurn += 1;
        if (intentTurn === 1) {
          return JSON.stringify(
            fictionalGemmaIntent({state: 'propozycje', slots: {product_type: 'pierścionek'}}),
          );
        }
        if (intentTurn === 2) {
          return JSON.stringify(
            fictionalGemmaIntent({state: 'propozycje', slots: {metal: 'srebro'}}),
          );
        }
        return JSON.stringify(
          fictionalGemmaIntent({
            state: 'koszyk',
            cart_action: 'add',
            cart_consent: true,
            product_ref: 'g1',
          }),
        );
      }
      if (intentTurn === 1) {
        return JSON.stringify({text: 'Polecam {{g1}}.', product_refs: ['g1']});
      }
      return JSON.stringify({text: 'x', product_refs: []});
    });

    const mcpSpy = vi.spyOn(mcpServer, 'callMcpToolDirect');
    const {namespace} = makeTrackedSessionNamespace();
    const sid = 'sess_dz8_multiturn';
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'pierścionek',
      new Request('https://example.com'),
      {sessionId: sid},
    );
    const nz = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'coś srebrnego',
      new Request('https://example.com'),
      {sessionId: sid},
    );
    expect(nz).toBe(epirCatalogEmptyReply('epir-online-store'));

    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'dodaj do koszyka',
      new Request('https://example.com'),
      {sessionId: sid},
    );

    const cartTools = mcpSpy.mock.calls.filter((c) =>
      ['create_cart', 'update_cart'].includes(String(c[1])),
    );
    expect(cartTools).toHaveLength(0);
    expect(productSpy).not.toHaveBeenCalled();
    expect(reply).toBe(epirCartProductQuestionReply('epir-online-store', false));
  });
});

describe('D-Q1 budżet tys / k', () => {
  it('T-D-Z5-variants: 5 tysięcy, 5 tyś, 3k, 2,5 tys', () => {
    expect(budgetMinorFromSlots({budget: 5}, 'mam 5 tysięcy')).toBe(500_000);
    expect(budgetMinorFromSlots({budget: 5}, 'budżet 5 tyś')).toBe(500_000);
    expect(budgetMinorFromSlots({budget: 3}, 'ok 3k')).toBe(300_000);
    expect(budgetMinorFromSlots({budget: 2.5}, 'do 2,5 tys')).toBe(250_000);
    expect(budgetMinorFromSlots({budget: 2.5}, 'do 2.5 tys')).toBe(250_000);
  });
});

describe('sort tanio vs trafność', () => {
  it('T-D-SORT-1: bez budżetu słownego — kolejność z repozytorium', async () => {
    const first = fictionalMultiVariantProduct();
    first.productId = 'gid://shopify/Product/900101';
    const second = {...fictionalMultiVariantProduct(), productId: 'gid://shopify/Product/900102'};
    second.variants = second.variants.map((v) => ({...v, price: moneyFromMinor(50_000)}));
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([
      fictionalMatchFromProduct(first),
      fictionalMatchFromProduct(second),
    ]);
    const top = await fetchGemmaCatalogMatchesForTurn({
      env: {} as never,
      channelId: 'epir-online-store',
      slots: {metal: 'złoto'},
      userCorpus: 'szukam złota',
    });
    expect(top[0]?.match.product.productId).toBe(first.productId);
  });
});
