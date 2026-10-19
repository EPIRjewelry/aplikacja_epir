/**
 * P0/P1 audyt 6a9c6bd — metal, budżet, koszyk, KB, routing, hydracja, (f)(g).
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {searchGemmaCatalog} from '../../../src/gemma/facts/catalog-search';
import * as facts from '../../../src/facts';
import {
  budgetPriceBoundsFromSlots,
  budgetMinorFromSlots,
} from '../../../src/gemma/actions/slots-to-filters';
import {
  appendOverBudgetToPriceDisplay,
  overBudgetMetalPriceLines,
} from '../../../src/gemma/facts/variant-prices';
import {runCartAction} from '../../../src/gemma/actions/cart';
import {buildEpirActionReply} from '../../../src/gemma/actions/reply';
import {runKbAction} from '../../../src/gemma/actions/kb';
import {transitionGemmaState} from '../../../src/gemma/state/machine';
import {DEFAULT_GEMMA_SESSION_STATE} from '../../../src/gemma/state/types';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';
import {
  fictionalMatchFromProduct,
  fictionalMultiVariantProduct,
} from '../fixtures/fictional-catalog-products';
import {moneyFromMinor} from '../../../src/facts/types';
import {GEMMA_INTENT_SYSTEM_PROMPT} from '../../../src/gemma/intent/extract-intent';
import {validateFormulationTextBeforeStitch} from '../../../src/gemma/validation/reply-validator';
import {normalizeProduct} from '../../../src/facts/normalize';
import {epirCartProductQuestionReply} from '../../../src/gemma/profiles/epir';
import * as kbPolicies from '../../../src/buyer/kb-policies';

describe('runda-6a9c6bd — metal i ceny (#5–7)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-6a9c6bd-METAL-1: metal B → jedna cena, bez widełek', async () => {
    const base = fictionalMultiVariantProduct();
    const product = {
      ...base,
      title: 'Pierścionek Testowy Liść',
      handle: 'test-lisc',
      variants: [
        {...base.variants[0], metal: 'metal A', price: moneyFromMinor(100_000), variantId: 'gid://shopify/ProductVariant/t1'},
        {...base.variants[1], metal: 'metal B', price: moneyFromMinor(300_000), variantId: 'gid://shopify/ProductVariant/t2'},
      ],
    };
    const full = fictionalMatchFromProduct(product);
    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: vi.fn().mockResolvedValue({
        matches: [full],
        total: 1,
        facets: {
          total: 1,
          byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
          byStone: {},
          byMetal: {},
          byProductType: {},
        },
      }),
    } as never);
    const out = await searchGemmaCatalog(
      {SHOP_DOMAIN: 'fikcyjny.myshopify.com'} as never,
      'epir-online-store',
      {metal: ['metal B'], text: 'test'},
      10,
    );
    expect(out[0].matchingVariants).toHaveLength(1);
    expect(out[0].matchingVariants[0].price.minor).toBe(300_000);
  });

  it('T-6a9c6bd-METAL-2: metal B + max 2000 → 0 produktów', async () => {
    const base = fictionalMultiVariantProduct();
    const product = {
      ...base,
      variants: [{...base.variants[1], metal: 'metal B', price: moneyFromMinor(300_000)}],
    };
    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: vi.fn().mockResolvedValue({
        matches: [fictionalMatchFromProduct(product)],
        total: 1,
        facets: {total: 1, byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0}, byStone: {}, byMetal: {}, byProductType: {}},
      }),
    } as never);
    const out = await searchGemmaCatalog(
      {SHOP_DOMAIN: 'x'} as never,
      'epir-online-store',
      {metal: ['metal B'], priceMax: moneyFromMinor(200_000)},
      10,
    );
    expect(out).toHaveLength(0);
  });

  it('T-6a9c6bd-OVER-1: ponad budżet w priceDisplay faktów', () => {
    const base = fictionalMultiVariantProduct();
    const product = {
      ...base,
      variants: [
        {...base.variants[1], metal: 'metal B', price: moneyFromMinor(150_000), variantId: 'gid://shopify/ProductVariant/in'},
        {...base.variants[2], metal: 'metal B', price: moneyFromMinor(300_000), variantId: 'gid://shopify/ProductVariant/over'},
      ],
    };
    const match = fictionalMatchFromProduct(product, {
      metal: ['metal B'],
      priceMax: moneyFromMinor(200_000),
    });
    const over = overBudgetMetalPriceLines(match, ['metal B'], moneyFromMinor(200_000));
    const display = appendOverBudgetToPriceDisplay('1500,00 zł', over);
    expect(display).toMatch(/ponad budżet/i);
    expect(display).toMatch(/3000/);
  });
});

describe('runda-6a9c6bd — budżet (a)(b) (#9–10)', () => {
  it('T-6a9c6bd-BUD-1: 5000 + do 5 tysięcy → max 500000', () => {
    const corpus = 'pierścionek do 5 tysięcy';
    expect(budgetMinorFromSlots({budget: '5000'}, corpus)).toBe(500_000);
    expect(budgetPriceBoundsFromSlots({budget: '5000'}, corpus).priceMax).toEqual(
      moneyFromMinor(500_000),
    );
  });

  it('T-6a9c6bd-BUD-2: 2,50 tys → 250000 groszy', () => {
    const corpus = 'do 2,50 tys zł';
    expect(budgetMinorFromSlots({budget: '2,50'}, corpus)).toBe(250_000);
  });

  it('T-6a9c6bd-BUD-3: 2,55 zł → 255 groszy', () => {
    expect(budgetMinorFromSlots({budget: '2,55'}, 'kwota 2,55 zł')).toBe(255);
  });

  it('T-6a9c6bd-BUD-4: od 5 tysięcy → priceMin', () => {
    const bounds = budgetPriceBoundsFromSlots({budget: '5000'}, 'budżet od 5 tysięcy');
    expect(bounds.priceMin).toEqual(moneyFromMinor(500_000));
    expect(bounds.priceMax).toBeUndefined();
  });

  it('T-6a9c6bd-BUD-5: od 1x5 bez min', () => {
    const bounds = budgetPriceBoundsFromSlots({budget: '1.5'}, 'od 1x5 zł');
    expect(bounds.priceMin).toBeUndefined();
  });
});

describe('runda-6a9c6bd — koszyk (#11–15)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-6a9c6bd-CART-1: rozmiar 14 → jeden wariant', async () => {
    const product = fictionalMultiVariantProduct();
    product.variants = [
      {
        ...product.variants[0],
        variantId: 'gid://shopify/ProductVariant/r13',
        available: true,
        selectedOptions: [{name: 'Rozmiar', value: '13'}],
        size: '13',
      },
      {
        ...product.variants[1],
        variantId: 'gid://shopify/ProductVariant/r14',
        available: true,
        selectedOptions: [{name: 'Rozmiar', value: '14'}],
        size: '14',
      },
    ];
    vi.spyOn(await import('../../../src/facts'), 'fetchProductFactsByHandle').mockResolvedValue(
      product,
    );
    const ready = await import('../../../src/buyer/tool-readiness');
    vi.spyOn(ready, 'listAvailableBuyerTools').mockResolvedValue(['ucp_cart']);
    const sessionCart = await import('../../../src/buyer/session-cart');
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(null);
    const spy = vi.spyOn(await import('../../../src/buyer/execute-buyer-tool'), 'executeBuyerTool').mockResolvedValue({
      content: '{}',
      cartMutationSucceeded: true,
      continueUrl: 'https://checkout.example.test/cart',
    });
    await runCartAction({
      env: {} as never,
      channelId: 'epir-online-store',
      request: new Request('https://example.com'),
      sessionId: 's',
      userText: 'rozmiar 14',
      userCorpus: 'rozmiar 14',
      prev: {
        ...DEFAULT_GEMMA_SESSION_STATE,
        shown: [{ref: 'g1', productId: product.productId, handle: product.handle, variantIds: [], url: '/p'}],
      },
      transitioned: {nextState: 'koszyk', slots: {}, allowedActions: ['cart']},
      intent: fictionalGemmaIntent({
        cart_action: 'add',
        cart_consent: true,
        product_ref: 'g1',
        variant_choice: 'rozmiar 14',
      }),
    });
    expect(spy).toHaveBeenCalled();
    const args = JSON.parse(String(spy.mock.calls[0]?.[0]?.argsJson ?? '{}'));
    expect(args.line_items?.[0]?.item?.id).toBe('gid://shopify/ProductVariant/r14');
  });

  it('T-6a9c6bd-CART-2: remove nie mówi „Zajmę się koszykiem”', () => {
    const reply = buildEpirActionReply({
      channelId: 'epir-online-store',
      state: 'koszyk',
      intent: fictionalGemmaIntent({cart_action: 'remove'}),
      outcome: {catalogCards: [], shown: [], cart: {cartFailed: true, clientErrors: []}},
    });
    expect(reply).not.toMatch(/Zajmę się koszykiem/i);
    expect(reply).toMatch(/Nie udało się zaktualizować koszyka/i);
  });

  it('T-6a9c6bd-CART-3: brak shown → pytanie bez „ostatnich propozycji”', () => {
    expect(epirCartProductQuestionReply('epir-online-store', false)).not.toMatch(/ostatnich propozycji/i);
  });
});

describe('runda-6a9c6bd — KB (#1–3)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-6a9c6bd-KB-1: retry z userText po empty policy_query', async () => {
    const spy = vi
      .spyOn(kbPolicies, 'searchShopPoliciesViaMcp')
      .mockResolvedValueOnce({ok: false, reason: 'empty'})
      .mockResolvedValueOnce({
        ok: true,
        answer: 'Fikcyjna odpowiedź FAQ.',
        sources: [{title: 'FAQ', url: 'https://example.test/faq'}],
      });
    const out = await runKbAction({
      env: {} as never,
      channelId: 'epir-online-store',
      request: new Request('https://example.com'),
      sessionId: 's',
      userText: 'Pełne pytanie klienta o zwroty?',
      userCorpus: 'Pełne pytanie klienta o zwroty?',
      prev: DEFAULT_GEMMA_SESSION_STATE,
      transitioned: {nextState: 'polityki_kontakt', slots: {}, allowedActions: ['kb_policies']},
      intent: fictionalGemmaIntent({policy_query: 'zwroty'}),
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(out?.answer).toMatch(/Fikcyjna/);
  });

  it('T-6a9c6bd-KB-2: kb_fact_dropped w walidatorze', () => {
    const violations = validateFormulationTextBeforeStitch(
      'Darmowa dostawa jest dostępna.',
      [],
      {
        allowedRefs: new Set(),
        allowedNumbers: new Set(['999']),
        kbAnswer: 'Darmowa dostawa od 999 zł.',
        userText: 'ile kosztuje dostawa',
        channelId: 'epir-online-store',
        conversationState: 'polityki_kontakt',
      },
    );
    expect(violations).toContain('kb_fact_dropped');
  });

  it('T-6a9c6bd-KB-3: prompt A — policy_query NL', () => {
    expect(GEMMA_INTENT_SYSTEM_PROMPT).toMatch(/pełne pytanie klienta/i);
  });
});

describe('runda-6a9c6bd — routing (#16,#18)', () => {
  it('T-6a9c6bd-ROUTE-1: cart show + product_type → propozycje', () => {
    const t = transitionGemmaState(DEFAULT_GEMMA_SESSION_STATE, fictionalGemmaIntent({
      cart_action: 'show',
      slots: {product_type: 'pierścionek'},
    }));
    expect(t.nextState).toBe('propozycje');
    expect(t.allowedActions).toContain('search_catalog');
  });

  it('T-6a9c6bd-ROUTE-2: custom + policy_query → KB', () => {
    const t = transitionGemmaState(DEFAULT_GEMMA_SESSION_STATE, fictionalGemmaIntent({
      slots: {product_type: 'zamówienie indywidualne'},
      policy_query: 'Ile trwa realizacja zamówienia indywidualnego?',
    }));
    expect(t.nextState).toBe('polityki_kontakt');
  });
});

describe('runda-6a9c6bd — hydracja (#17)', () => {
  it('T-6a9c6bd-HYD-1: EPIR handle bez onlineStoreUrl + template → URL', () => {
    const facts = normalizeProduct(
      {
        id: 'gid://shopify/Product/1',
        handle: 'test-lisc',
        title: 'Pierścionek Testowy Liść',
        variants: {nodes: []},
      },
      {
        channel: 'epir-online-store',
        urlTemplate: 'https://epirbizuteria.pl/products/{handle}',
        fetchedAt: new Date().toISOString(),
      },
    );
    expect(facts?.url).toBe('https://epirbizuteria.pl/products/test-lisc');
  });
});

describe('runda-6a9c6bd — (f) dzięki + budget', () => {
  it('T-6a9c6bd-THANKS-1: podziękowanie bez search', () => {
    const prev = {...DEFAULT_GEMMA_SESSION_STATE, slots: {budget: '3000'}};
    const t = transitionGemmaState(prev, fictionalGemmaIntent({
      state: 'powitanie',
      slots: {occasion: 'podziękowanie'},
    }));
    expect(t.nextState).toBe('powitanie');
    expect(t.allowedActions).toHaveLength(0);
  });
});
