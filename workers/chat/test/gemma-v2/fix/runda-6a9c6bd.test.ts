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
import {
  epirCartConsentWithProductLink,
  epirCartProductQuestionReply,
  epirKbAnswerReply,
} from '../../../src/gemma/profiles/epir';
import * as kbPolicies from '../../../src/buyer/kb-policies';
import {buildTurnFacts} from '../../../src/gemma/formulation/build-turn-facts';
import {maybeFormulateReply} from '../../../src/gemma/formulation/run-formulation';
import {composeGemmaReply} from '../../../src/gemma/compose-gemma-reply';
import {makeTrackedSessionNamespace} from '../helpers/session-do-calls';
import {stubGemmaIntentJson} from '../helpers/stub-gemma-intent';
import * as execute from '../../../src/buyer/execute-buyer-tool';
import type {Env} from '../../../src/config/bindings';

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

  it('T-6a9c6bd-METAL-3: wariant bez metalu przy slocie metal → produkt zostaje', async () => {
    const base = fictionalMultiVariantProduct();
    const product = {
      ...base,
      variants: [{...base.variants[0], metal: null, price: moneyFromMinor(100_000)}],
    };
    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: vi.fn().mockResolvedValue({
        matches: [fictionalMatchFromProduct(product)],
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
      {SHOP_DOMAIN: 'x'} as never,
      'epir-online-store',
      {metal: ['złoto']},
      10,
    );
    expect(out).toHaveLength(1);
  });

  it('T-6a9c6bd-STONE-1: slot kamień, stones=[] → produkt zostaje', async () => {
    const base = fictionalMultiVariantProduct();
    const product = {...base, stones: []};
    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: vi.fn().mockResolvedValue({
        matches: [fictionalMatchFromProduct(product)],
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
      {SHOP_DOMAIN: 'x'} as never,
      'epir-online-store',
      {stone: ['fikcyjny szafir']},
      10,
    );
    expect(out).toHaveLength(1);
  });

  it('T-6a9c6bd-OVER-2: buildTurnFacts zawiera ponad budżet', () => {
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
    const turn = buildTurnFacts({
      channelId: 'epir-online-store',
      state: 'propozycje',
      userText: 'metal B do 2000',
      outcome: {
        catalogCards: [{ref: 'g1', match, minMinor: 150_000}],
        shown: [{ref: 'g1', productId: product.productId, handle: product.handle, variantIds: [], url: '/p'}],
      },
      catalogFilters: {metal: ['metal B'], priceMax: moneyFromMinor(200_000)},
    });
    expect(turn.products[0]?.priceDisplay).toMatch(/ponad budżet/i);
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

  it('T-6a9c6bd-CART-2: remove nie mówi „Zajmę się koszykiem”', async () => {
    const out = await runCartAction({
      env: {} as never,
      channelId: 'epir-online-store',
      request: new Request('https://example.com'),
      sessionId: 's',
      userText: 'usuń',
      userCorpus: 'usuń',
      prev: DEFAULT_GEMMA_SESSION_STATE,
      transitioned: {nextState: 'koszyk', slots: {}, allowedActions: ['cart']},
      intent: fictionalGemmaIntent({cart_action: 'remove'}),
    });
    const reply = buildEpirActionReply({
      channelId: 'epir-online-store',
      state: 'koszyk',
      intent: fictionalGemmaIntent({cart_action: 'remove'}),
      outcome: {catalogCards: [], shown: [], cart: out},
    });
    expect(reply).not.toMatch(/Zajmę się koszykiem/i);
    expect(reply).toMatch(/Nie udało się zaktualizować koszyka/i);
  });

  it('T-6a9c6bd-CART-2b: mutacja bez continueUrl — bez „Zajmę się koszykiem”', async () => {
    const product = fictionalMultiVariantProduct();
    product.variants = [product.variants[0]!];
    vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue(product);
    const ready = await import('../../../src/buyer/tool-readiness');
    vi.spyOn(ready, 'listAvailableBuyerTools').mockResolvedValue(['ucp_cart']);
    const sessionCart = await import('../../../src/buyer/session-cart');
    vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(null);
    vi.spyOn(execute, 'executeBuyerTool').mockResolvedValue({
      content: '{}',
      cartMutationSucceeded: true,
    });
    const out = await runCartAction({
      env: {} as never,
      channelId: 'epir-online-store',
      request: new Request('https://example.com'),
      sessionId: 's',
      userText: 'dodaj',
      userCorpus: 'dodaj',
      prev: {
        ...DEFAULT_GEMMA_SESSION_STATE,
        shown: [
          {
            ref: 'g1',
            productId: product.productId,
            handle: product.handle,
            variantIds: [product.variants[0]!.variantId],
            url: '/p',
          },
        ],
      },
      transitioned: {nextState: 'koszyk', slots: {}, allowedActions: ['cart']},
      intent: fictionalGemmaIntent({cart_action: 'add', cart_consent: true, product_ref: 'g1'}),
    });
    const reply = buildEpirActionReply({
      channelId: 'epir-online-store',
      state: 'koszyk',
      intent: fictionalGemmaIntent({cart_action: 'add', cart_consent: true, product_ref: 'g1'}),
      outcome: {catalogCards: [], shown: [], cart: out},
    });
    expect(reply).not.toMatch(/Zajmę się koszykiem/i);
    expect(reply).toMatch(/Nie udało się zaktualizować koszyka/i);
  });

  it('T-6a9c6bd-CART-2c: końcowy return — bez „Zajmę się koszykiem”', async () => {
    const out = await runCartAction({
      env: {} as never,
      channelId: 'epir-online-store',
      request: new Request('https://example.com'),
      sessionId: 's',
      userText: 'x',
      userCorpus: 'x',
      prev: DEFAULT_GEMMA_SESSION_STATE,
      transitioned: {nextState: 'koszyk', slots: {}, allowedActions: ['cart']},
      intent: fictionalGemmaIntent({cart_action: 'change' as never}),
    });
    // force unknown action path via cast: set cart_action to something that falls through
    const fallthrough = await runCartAction({
      env: {} as never,
      channelId: 'epir-online-store',
      request: new Request('https://example.com'),
      sessionId: 's',
      userText: 'x',
      userCorpus: 'x',
      prev: DEFAULT_GEMMA_SESSION_STATE,
      transitioned: {nextState: 'koszyk', slots: {}, allowedActions: ['cart']},
      intent: {...fictionalGemmaIntent({}), cart_action: 'noop' as never},
    });
    void out;
    const reply = buildEpirActionReply({
      channelId: 'epir-online-store',
      state: 'koszyk',
      intent: fictionalGemmaIntent({cart_action: 'add', cart_consent: true}),
      outcome: {catalogCards: [], shown: [], cart: fallthrough},
    });
    expect(reply).not.toMatch(/Zajmę się koszykiem/i);
    expect(reply).toMatch(/Nie udało się zaktualizować koszyka/i);
  });

  it('T-6a9c6bd-CART-3: brak shown → pytanie bez „ostatnich propozycji”', () => {
    expect(epirCartProductQuestionReply('epir-online-store', false)).not.toMatch(/ostatnich propozycji/i);
  });

  it('T-6a9c6bd-CART-4: pusty ref + jeden shown → create_cart', async () => {
    const product = fictionalMultiVariantProduct();
    product.variants = [product.variants[0]!];
    vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue(product);
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
      env: {} as never,
      channelId: 'epir-online-store',
      request: new Request('https://example.com'),
      sessionId: 's',
      userText: 'dodaj',
      userCorpus: 'dodaj',
      prev: {
        ...DEFAULT_GEMMA_SESSION_STATE,
        shown: [
          {
            ref: 'g1',
            productId: product.productId,
            handle: product.handle,
            variantIds: [product.variants[0]!.variantId],
            url: '/p',
            title: product.title,
          },
        ],
      },
      transitioned: {nextState: 'koszyk', slots: {}, allowedActions: ['cart']},
      intent: fictionalGemmaIntent({cart_action: 'add', cart_consent: true, product_ref: null}),
    });
    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0]?.[0]?.name)).toBe('create_cart');
  });

  it('T-6a9c6bd-CART-5: „14” przy dwóch opcjach → variantUnresolved', async () => {
    const product = fictionalMultiVariantProduct();
    product.variants = [
      {
        ...product.variants[0]!,
        variantId: 'gid://shopify/ProductVariant/a14',
        available: true,
        selectedOptions: [
          {name: 'Rozmiar', value: '14'},
          {name: 'Długość', value: '14'},
        ],
        size: '14',
      },
      {
        ...product.variants[1]!,
        variantId: 'gid://shopify/ProductVariant/b14',
        available: true,
        selectedOptions: [
          {name: 'Rozmiar', value: '14'},
          {name: 'Długość', value: '16'},
        ],
        size: '14',
      },
    ];
    vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue(product);
    const out = await runCartAction({
      env: {} as never,
      channelId: 'epir-online-store',
      request: new Request('https://example.com'),
      sessionId: 's',
      userText: '14',
      userCorpus: '14',
      prev: {
        ...DEFAULT_GEMMA_SESSION_STATE,
        shown: [
          {
            ref: 'g1',
            productId: product.productId,
            handle: product.handle,
            variantIds: [],
            url: '/p',
          },
        ],
      },
      transitioned: {nextState: 'koszyk', slots: {}, allowedActions: ['cart']},
      intent: fictionalGemmaIntent({
        cart_action: 'add',
        cart_consent: true,
        product_ref: 'g1',
        variant_choice: '14',
      }),
    });
    expect(out.variantUnresolved).toBe(true);
  });

  it('T-6a9c6bd-CART-6: niedostępny rozmiar 14 → variantUnresolved', async () => {
    const product = fictionalMultiVariantProduct();
    product.variants = [
      {
        ...product.variants[0]!,
        variantId: 'gid://shopify/ProductVariant/r14u',
        available: false,
        selectedOptions: [{name: 'Rozmiar', value: '14'}],
        size: '14',
      },
      {
        ...product.variants[1]!,
        variantId: 'gid://shopify/ProductVariant/r13a',
        available: true,
        selectedOptions: [{name: 'Rozmiar', value: '13'}],
        size: '13',
      },
    ];
    vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue(product);
    const out = await runCartAction({
      env: {} as never,
      channelId: 'epir-online-store',
      request: new Request('https://example.com'),
      sessionId: 's',
      userText: 'rozmiar 14',
      userCorpus: 'rozmiar 14',
      prev: {
        ...DEFAULT_GEMMA_SESSION_STATE,
        shown: [
          {
            ref: 'g1',
            productId: product.productId,
            handle: product.handle,
            variantIds: [],
            url: '/p',
          },
        ],
      },
      transitioned: {nextState: 'koszyk', slots: {}, allowedActions: ['cart']},
      intent: fictionalGemmaIntent({
        cart_action: 'add',
        cart_consent: true,
        product_ref: 'g1',
        variant_choice: 'rozmiar 14',
      }),
    });
    expect(out.variantUnresolved).toBe(true);
  });

  it('T-6a9c6bd-CART-7: add + consent=false → zgoda z linkiem, 0 create_cart', async () => {
    const {namespace} = makeTrackedSessionNamespace();
    const env = {SESSION_DO: namespace} as Env;
    const {writeGemmaState} = await import('../../../src/gemma/session-gemma-state');
    const sid = 'sess_6a9c6bd_consent_false';
    await writeGemmaState(env, sid, {
      state: 'propozycje',
      slots: {},
      shown: [
        {
          ref: 'g1',
          productId: 'gid://shopify/Product/900001',
          handle: 'test-lisc',
          variantIds: [],
          url: '/products/test-lisc',
        },
      ],
      selected: null,
      form_of_address: 'unknown',
      turn: 1,
    });
    await stubGemmaIntentJson({cart_action: 'add', cart_consent: false, product_ref: 'g1'});
    const spy = vi.spyOn(execute, 'executeBuyerTool');
    const reply = await composeGemmaReply(
      env,
      'epir-online-store',
      'wolę sam dodać',
      new Request('https://example.com'),
      {sessionId: sid, storefrontId: 'online-store', bodyChannel: 'online-store'},
    );
    expect(spy).not.toHaveBeenCalled();
    expect(reply).toBe(
      epirCartConsentWithProductLink('epir-online-store', '/products/test-lisc'),
    );
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

  it('T-6a9c6bd-PROMPT-CART-SHOW: literał cart_action=show tylko przy koszyku', () => {
    expect(GEMMA_INTENT_SYSTEM_PROMPT).toMatch(
      /cart_action=show tylko gdy klient prosi o pokazanie lub podsumowanie koszyka/i,
    );
  });

  it('T-6a9c6bd-PROMPT-CART-ADD: literał dodaj/wrzuć → consent true', () => {
    expect(GEMMA_INTENT_SYSTEM_PROMPT).toMatch(
      /„dodaj do koszyka” \/ „wrzuć do koszyka” → cart_action=add, cart_consent=true/i,
    );
  });

  it('T-6a9c6bd-PROMPT-CART-CONSENT-FALSE: literał consent=false', () => {
    expect(GEMMA_INTENT_SYSTEM_PROMPT).toMatch(/cart_action=add, cart_consent=false/i);
  });

  it('T-6a9c6bd-KB-4: kb_fact_dropped → epirKbAnswerReply, nie deterministicReply', async () => {
    const ai = await import('../../../src/ai-client');
    vi.spyOn(ai, 'getGroqResponse').mockResolvedValue(
      JSON.stringify({text: 'Darmowa dostawa jest dostępna.', product_refs: []}),
    );
    const kbAnswer = 'Darmowa dostawa od 999 zł.';
    const reply = await maybeFormulateReply({
      env: {} as never,
      channelId: 'epir-online-store',
      userText: 'ile kosztuje dostawa',
      state: 'polityki_kontakt',
      outcome: {
        catalogCards: [],
        shown: [],
        kb: {answer: kbAnswer, sources: []},
      },
      deterministicReply: 'FALLBACK_DETERMINISTIC',
    });
    expect(reply).toBe(epirKbAnswerReply(kbAnswer));
    expect(reply).not.toBe('FALLBACK_DETERMINISTIC');
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
