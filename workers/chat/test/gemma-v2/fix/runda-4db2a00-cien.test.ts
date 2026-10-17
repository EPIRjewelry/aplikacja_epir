/**
 * Zbiorcza runda 4db2a00 — D-P1..P4, D-Z2/3/4/5/7/8/9 (Cień).
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {composeGemmaReply} from '../../../src/gemma/compose-gemma-reply';
import {searchGemmaCatalog} from '../../../src/gemma/facts/catalog-search';
import {buildUcpSearchCatalogArgs} from '../../../src/facts/catalog-ucp-args';
import {moneyFromMinor} from '../../../src/facts/types';
import * as mcpServer from '../../../src/mcp_server';
import {MCP_CATALOG_TRANSPORT_EMPTY_RESULT} from '../../../src/mcp_server';
import * as catalogSearch from '../../../src/gemma/facts/catalog-search';
import * as facts from '../../../src/facts';
import {CatalogMcpTransportEmptyError} from '../../../src/facts';
import {budgetMinorFromSlots} from '../../../src/gemma/actions/slots-to-filters';
import {fetchGemmaCatalogMatchesForTurn} from '../../../src/gemma/facts/catalog-fetch-for-turn';
import {
  fictionalMatchFromProduct,
  fictionalMultiVariantProduct,
} from '../fixtures/fictional-catalog-products';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';
import {makeTrackedSessionNamespace} from '../helpers/session-do-calls';
import {stubGemmaGroqCalls} from '../helpers/stub-gemma-groq';
import {EPIR_CUSTOM_ORDER_FORM_URL} from '../../../src/buyer/channel-origins';
import {epirCatalogTransportReply} from '../../../src/gemma/profiles/epir';

describe('Runda 4db2a00 — Cień', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-D-Z5-1: „mam ok 3 tys” → kwota 3000 zł, nie budżet jakościowy', () => {
    const minor = budgetMinorFromSlots({budget: '3'}, 'mam ok 3 tys');
    expect(minor).toBe(300_000);
  });

  it('T-D-P2-1: priceMax w filtrach trafia do argumentów MCP search_catalog', () => {
    const args = buildUcpSearchCatalogArgs(
      {text: 'pierścionek', priceMax: moneyFromMinor(300_000)},
      6,
    );
    const catalog = args.catalog as {filters?: {price?: {max?: number}}};
    expect(catalog.filters?.price?.max).toBe(300_000);
  });

  it('T-D-Z3-1: CATALOG_EMPTY → transport_empty i szablon awarii katalogu', async () => {
    vi.spyOn(facts, 'getCatalogRepository').mockImplementation(async () => ({
      search: async () => {
        throw new CatalogMcpTransportEmptyError();
      },
    } as never));
    const {namespace} = makeTrackedSessionNamespace();
    vi.spyOn(await import('../../../src/ai-client'), 'getGroqResponse').mockImplementation(
      async (_m, _e, opts) => {
        if (opts?.timingLabel === 'buyer_gemma_intent') {
          return JSON.stringify(fictionalGemmaIntent({state: 'propozycje', slots: {budget: '3000'}}));
        }
        return JSON.stringify({text: 'Polecam {{g1}}.', product_refs: ['g1']});
      },
    );
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'pierścionek',
      new Request('https://example.com'),
      {sessionId: 'sess_dz3_transport'},
    );
    expect(reply).toBe(epirCatalogTransportReply('epir-online-store'));
    expect(reply).not.toMatch(/Nie znalazłam propozycji/);
  });

  it('T-D-Z3-2: wykrywanie MCP_CATALOG_TRANSPORT_EMPTY_RESULT (współdzielona stała)', () => {
    expect(mcpServer.isMcpCatalogTransportEmptyResult(MCP_CATALOG_TRANSPORT_EMPTY_RESULT)).toBe(true);
    expect(mcpServer.isMcpCatalogTransportEmptyResult({products: [], system_note: 'x'})).toBe(false);
  });

  it('T-D-Z7a-1: odcisk palca — link do formularza (R05.1)', async () => {
    await stubGemmaGroqCalls({
      intent: {
        state: 'propozycje',
        slots: {product_type: 'zamówienie indywidualne'},
      },
      formulation: {text: 'Polecam kontakt w sprawie projektu.', product_refs: []},
    });
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'Niestety nie posiadamy obrączek z odciskiem palca, ale możemy rozważyć indywidualne zamówienie',
      new Request('https://example.com'),
      {sessionId: 'sess_dz7a_custom'},
    );
    expect(reply).toContain(EPIR_CUSTOM_ORDER_FORM_URL);
  });

  it('T-D-thanks-1: „dzięki” bez nowego search_catalog (R04.2)', async () => {
    const searchSpy = vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([]);
    await stubGemmaGroqCalls({
      intent: {
        state: 'powitanie',
        slots: {occasion: 'podziękowanie', budget: 'tanio'},
      },
    });
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'dzięki',
      new Request('https://example.com'),
      {sessionId: 'sess_thanks_r042'},
    );
    expect(searchSpy).not.toHaveBeenCalled();
    expect(reply).toContain('Proszę bardzo');
  });

  it('T-D-Z7b-1: luksus — sort malejący (R15.2)', async () => {
    const cheap = fictionalMultiVariantProduct();
    const expensive = {...fictionalMultiVariantProduct(), productId: 'gid://shopify/Product/900099'};
    expensive.variants = expensive.variants.map((v) => ({
      ...v,
      price: moneyFromMinor(500_000),
    }));
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([
      fictionalMatchFromProduct(cheap),
      fictionalMatchFromProduct(expensive),
    ]);
    const top = await fetchGemmaCatalogMatchesForTurn({
      env: {} as never,
      channelId: 'epir-online-store',
      slots: {budget: 'luksusowa biżuteria'},
      userCorpus: 'szukam luksusowej biżuterii',
    });
    expect(top[0]?.minMinor).toBeGreaterThan(top[1]?.minMinor ?? 0);
  });

  it('T-R04-tanio-1: coś taniego — B wybiera najtańsze refs (mock formulation)', async () => {
    const cheap = fictionalMultiVariantProduct();
    cheap.title = 'Fikcyjny tanio A';
    cheap.variants = cheap.variants.map((v, i) =>
      i === 0 ? {...v, price: moneyFromMinor(190_00)} : {...v, price: moneyFromMinor(500_000)},
    );
    const mid = {...fictionalMultiVariantProduct(), productId: 'gid://shopify/Product/900002'};
    mid.title = 'Fikcyjny tanio B';
    mid.variants = mid.variants.map((v) => ({...v, price: moneyFromMinor(210_00)}));
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([
      fictionalMatchFromProduct(mid),
      fictionalMatchFromProduct(cheap),
    ]);
    await stubGemmaGroqCalls({
      intent: {state: 'propozycje', slots: {budget: 'tanio'}},
      formulation: {
        text: 'Polecam {{g1}} oraz {{g2}}.',
        product_refs: ['g1', 'g2'],
      },
    });
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'coś taniego',
      new Request('https://example.com'),
      {sessionId: 'sess_r04_tanio_b'},
    );
    expect(reply).toContain('Fikcyjny tanio A');
    expect(reply).toContain('Fikcyjny tanio B');
  });

  it('T-D-Z8-1: koszyk bez shown — pytanie o produkt, nie MCP (R09.3)', async () => {
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([]);
    const ai = await import('../../../src/ai-client');
    let calls = 0;
    vi.spyOn(ai, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') {
        calls += 1;
        if (calls === 1) {
          return JSON.stringify(
            fictionalGemmaIntent({
              state: 'propozycje',
              slots: {metal: 'srebro', stone: 'granat'},
            }),
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
      return JSON.stringify({text: 'x', product_refs: []});
    });
    const mcpSpy = vi.spyOn(mcpServer, 'callMcpToolDirect');
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'dodaj do koszyka',
      new Request('https://example.com'),
      {sessionId: 'sess_dz8_cart_no_shown'},
    );
    const cartTools = mcpSpy.mock.calls.filter((c) =>
      ['create_cart', 'update_cart'].includes(String(c[1])),
    );
    expect(cartTools).toHaveLength(0);
    expect(reply).toMatch(/Który wariant|koszyk/i);
  });
});
