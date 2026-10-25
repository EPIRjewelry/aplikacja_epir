/**
 * E4 compose integration.
 * - **M-E4-6** — mutacja koszyka bez cart_action → T-E4-GUARD-1b FAIL
 * - **M-E4-14** — allowedVariantIds z całego katalogu → T-E4-GUARD-2 FAIL
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {composeGemmaReply} from '../../src/gemma/compose-gemma-reply';
import {makeTrackedSessionNamespace} from './helpers/session-do-calls';
import {stubGemmaIntentJson} from './helpers/stub-gemma-intent';
import * as execute from '../../src/buyer/execute-buyer-tool';
import * as catalogSearch from '../../src/gemma/facts/catalog-search';
import * as toolReadiness from '../../src/buyer/tool-readiness';
import {fictionalMatchFromProduct, fictionalMultiVariantProduct} from './fixtures/fictional-catalog-products';
import {handleBuyerTurn} from '../../src/buyer/handle-buyer-turn';
import {geBuyerBody} from './fixtures/boundary-payloads';
import {makeGemmaRuntimeKv} from './fixtures/fake-testers-kv';
import {geBuyerBrandLock} from './helpers/brand-lock-fixtures';
import {epirCartConsentWithProductLink, epirCartErrorReply} from '../../src/gemma/profiles/epir';
import {FICTIONAL_CATALOG_READY_SLOTS} from './fixtures/gemma-intent';
import {DEFAULT_GEMMA_SESSION_STATE} from '../../src/gemma/state/types';

async function seedShownG1(namespace: DurableObjectNamespace, sid: string): Promise<void> {
  const product = fictionalMultiVariantProduct();
  const {writeGemmaState} = await import('../../src/gemma/session-gemma-state');
  await writeGemmaState({SESSION_DO: namespace} as never, sid, {
    ...DEFAULT_GEMMA_SESSION_STATE,
    shown: [
      {
        ref: 'g1',
        productId: product.productId,
        handle: product.handle,
        variantIds: product.variants.map((v) => v.variantId),
        url: '/products/fikcyjny-pierscionek-parity',
      },
    ],
    turn: 1,
  });
}

describe('E4 composeGemmaReply actions', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-E4-GUARD-1: catalog turn does not call executeBuyerTool', async () => {
    await stubGemmaIntentJson({slots: {...FICTIONAL_CATALOG_READY_SLOTS}});
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([
      fictionalMatchFromProduct(fictionalMultiVariantProduct()),
    ]);
    const execSpy = vi.spyOn(execute, 'executeBuyerTool');
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'fikcyjne zapytanie katalog',
      new Request('https://example.com'),
      {sessionId: 'sess_e4_guard_1', storefrontId: 'online-store', bodyChannel: 'online-store'},
    );
    expect(execSpy).not.toHaveBeenCalled();
  });

  it('T-E4-SPEED-1: catalog turn listAvailableBuyerTools 0×; cart turn 1×', async () => {
    const readySpy = vi.spyOn(toolReadiness, 'listAvailableBuyerTools');
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([]);
    await stubGemmaIntentJson({slots: {...FICTIONAL_CATALOG_READY_SLOTS}});
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'fikcyjne',
      new Request('https://example.com'),
      {sessionId: 'sess_e4_speed_cat', storefrontId: 'online-store', bodyChannel: 'online-store'},
    );
    expect(readySpy).not.toHaveBeenCalled();

    readySpy.mockClear();
    readySpy.mockResolvedValue(['ucp_cart']);
    const facts = await import('../../src/facts');
    vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue(fictionalMultiVariantProduct());
    vi.spyOn(await import('../../src/buyer/session-cart'), 'readSessionCartId').mockResolvedValue(null);
    vi.spyOn(execute, 'executeBuyerTool').mockResolvedValue({content: '{}'});
    await stubGemmaIntentJson({
      cart_action: 'add',
      cart_consent: true,
      product_ref: 'g1',
      variant_choice: 'gid://shopify/ProductVariant/900001-c',
    });
    await seedShownG1(namespace, 'sess_e4_speed_cart');
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'dodaj do koszyka',
      new Request('https://example.com'),
      {sessionId: 'sess_e4_speed_cart', storefrontId: 'online-store', bodyChannel: 'online-store'},
    );
    expect(readySpy).toHaveBeenCalledTimes(1);
  });

  it('T-E4-ERR-1: executeBuyerTool throw → cart error reply without checkout URL', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue(['ucp_cart']);
    const facts = await import('../../src/facts');
    vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue(fictionalMultiVariantProduct());
    vi.spyOn(await import('../../src/buyer/session-cart'), 'readSessionCartId').mockResolvedValue(null);
    vi.spyOn(execute, 'executeBuyerTool').mockRejectedValue(new Error('mcp down'));
    await stubGemmaIntentJson({
      cart_action: 'add',
      cart_consent: true,
      product_ref: 'g1',
      variant_choice: 'gid://shopify/ProductVariant/900001-c',
    });
    const {namespace} = makeTrackedSessionNamespace();
    await seedShownG1(namespace, 'sess_e4_err');
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'dodaj',
      new Request('https://example.com'),
      {sessionId: 'sess_e4_err', storefrontId: 'online-store', bodyChannel: 'online-store'},
    );
    expect(reply).not.toMatch(/checkout/i);
    expect(reply).toBe(epirCartErrorReply('epir-online-store'));
  });

  it('T-E4-STATE-1: catalog turn persists shown on SessionDO stub', async () => {
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([
      fictionalMatchFromProduct(fictionalMultiVariantProduct()),
    ]);
    await stubGemmaIntentJson({slots: {...FICTIONAL_CATALOG_READY_SLOTS}});
    const {namespace} = makeTrackedSessionNamespace();
    const sid = 'sess_e4_state_1';
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'fikcyjne',
      new Request('https://example.com'),
      {sessionId: sid, storefrontId: 'online-store', bodyChannel: 'online-store'},
    );
    const res = await namespace.get(namespace.idFromName(sid)).fetch('https://session/gemma-state');
    const state = (await res.json()) as {shown: unknown[]};
    expect(state.shown.length).toBeGreaterThan(0);
  });

  it('T-E4-CART-1 extension: consent false includes product link', async () => {
    await stubGemmaIntentJson({cart_action: 'add', cart_consent: false, product_ref: 'g1'});
    const {namespace} = makeTrackedSessionNamespace();
    const {writeGemmaState} = await import('../../src/gemma/session-gemma-state');
    const sid = 'sess_e4_cart_link';
    await writeGemmaState({SESSION_DO: namespace} as never, sid, {
      state: 'propozycje',
      slots: {},
      shown: [
        {
          ref: 'g1',
          productId: 'gid://shopify/Product/900001',
          handle: 'fikcyjny-pierscionek-parity',
          variantIds: [],
          url: '/products/fikcyjny-pierscionek-parity',
        },
      ],
      selected: null,
      form_of_address: 'unknown',
      turn: 1,
    });
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'proszę dodać',
      new Request('https://example.com'),
      {sessionId: sid, storefrontId: 'online-store', bodyChannel: 'online-store'},
    );
    expect(reply).toContain('/products/fikcyjny-pierscionek-parity');
    expect(reply).toBe(epirCartConsentWithProductLink('epir-online-store', '/products/fikcyjny-pierscionek-parity'));
  });

  it('T-E4-GUARD-2: executeBuyerTool allowedVariantIds only from target product', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue(['ucp_cart']);
    const product = fictionalMultiVariantProduct();
    const facts = await import('../../src/facts');
    vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue(product);
    vi.spyOn(await import('../../src/buyer/session-cart'), 'readSessionCartId').mockResolvedValue(null);
    const execSpy = vi.spyOn(execute, 'executeBuyerTool').mockResolvedValue({
      content: '{}',
      cartMutationSucceeded: true,
      continueUrl: 'https://checkout.example.test/cart',
    });
    await stubGemmaIntentJson({
      cart_action: 'add',
      cart_consent: true,
      product_ref: 'g1',
      variant_choice: 'gid://shopify/ProductVariant/900001-c',
    });
    const {namespace} = makeTrackedSessionNamespace();
    const {writeGemmaState} = await import('../../src/gemma/session-gemma-state');
    const sid = 'sess_e4_guard_2';
    await writeGemmaState({SESSION_DO: namespace} as never, sid, {
      ...DEFAULT_GEMMA_SESSION_STATE,
      shown: [
        {
          ref: 'g1',
          productId: product.productId,
          handle: product.handle,
          variantIds: product.variants.map((v) => v.variantId),
          url: '/products/fikcyjny',
        },
      ],
      turn: 1,
    });
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'dodaj',
      new Request('https://example.com'),
      {sessionId: sid, storefrontId: 'online-store', bodyChannel: 'online-store'},
    );
    const call = execSpy.mock.calls[0]?.[0];
    expect(call?.allowedVariantIds.size).toBe(product.variants.length);
  });

  it('T-E4-LEGACY-1: legacy handleBuyerTurn does not import gemma actions', async () => {
    const compose = await import('../../src/buyer/compose-buyer-turn');
    const legacySpy = vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('legacy');
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({channelMode: 'on', coreMode: 'legacy'}),
    } as never;
    const res = await handleBuyerTurn(
      new Request('https://example.com/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(geBuyerBody()),
      }),
      env,
      geBuyerBrandLock(),
      geBuyerBody(),
    );
    expect(res.status).toBe(200);
    expect(legacySpy).toHaveBeenCalled();
  });

  it('T-E4-GUARD-1b: consent true but no cart_action → zero executeBuyerTool', async () => {
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue(['ucp_cart']);
    const facts = await import('../../src/facts');
    vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue(fictionalMultiVariantProduct());
    vi.spyOn(await import('../../src/buyer/session-cart'), 'readSessionCartId').mockResolvedValue(null);
    const execSpy = vi.spyOn(execute, 'executeBuyerTool').mockResolvedValue({content: '{}'});
    await stubGemmaIntentJson({
      cart_action: null,
      cart_consent: true,
      product_ref: 'g1',
      variant_choice: 'gid://shopify/ProductVariant/900001-c',
    });
    const {namespace} = makeTrackedSessionNamespace();
    await seedShownG1(namespace, 'sess_e4_guard_1b');
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'dziękuję',
      new Request('https://example.com'),
      {sessionId: 'sess_e4_guard_1b', storefrontId: 'online-store', bodyChannel: 'online-store'},
    );
    expect(execSpy).not.toHaveBeenCalled();
  });
});
