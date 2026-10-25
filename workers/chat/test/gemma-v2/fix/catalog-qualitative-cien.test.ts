/**
 * Cień live-fix — qualitative budget catalog (D1/D2/D3/D5/D6/D8).
 * Mutacje: M-FIX-1..M-FIX-6 (patrz komentarze przy testach).
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {buildUcpSearchCatalogArgs} from '../../../src/facts/catalog-ucp-args';
import {CatalogMcpSearchError} from '../../../src/gemma/facts/catalog-mcp-error';
import * as facts from '../../../src/facts';
import * as mcpServer from '../../../src/mcp_server';
import {hasCatalogQueryOrFilters} from '../../../src/mcp_server';
import {composeGemmaReply} from '../../../src/gemma/compose-gemma-reply';
import {fetchGemmaCatalogMatchesForTurn} from '../../../src/gemma/facts/catalog-fetch-for-turn';
import {searchGemmaCatalog} from '../../../src/gemma/facts/catalog-search';
import {
  epirCatalogEmptyReply,
  epirCatalogTransportReply,
  listEpirTemplateStrings,
  templateStartsWithProszePana,
} from '../../../src/gemma/profiles/epir';
import {GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT} from '../../../src/gemma/actions/catalog-limits';
import {slotsToCatalogFilters} from '../../../src/gemma/actions/slots-to-filters';
import * as catalogSearch from '../../../src/gemma/facts/catalog-search';
import {fictionalMatchFromProduct, fictionalMultiVariantProduct} from '../fixtures/fictional-catalog-products';
import {FICTIONAL_CATALOG_READY_SLOTS, fictionalGemmaIntent} from '../fixtures/gemma-intent';
import {makeTrackedSessionNamespace} from '../helpers/session-do-calls';
import {stubGemmaIntentJson} from '../helpers/stub-gemma-intent';
import {moneyFromMinor} from '../../../src/facts/types';

describe('Cień catalog qualitative fix', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-FIX-2 / R04-args: browse args pass mcp_server hasCatalogQueryOrFilters (M-FIX-2)', () => {
    const args = buildUcpSearchCatalogArgs(
      {available: true},
      GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT,
      {browseInStockAvailable: true},
    );
    const catalog = args.catalog as Record<string, unknown>;
    expect('query' in catalog).toBe(false);
    expect(catalog.filters).toEqual({available: true});
    expect(hasCatalogQueryOrFilters(args)).toBe(true);
  });

  it('T-FIX-BROWSE-MCP-ARGS: browse search_catalog MCP filters are only available:true', async () => {
    const mcpSpy = vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      result: {content: [{type: 'text', text: JSON.stringify({products: []})}]},
    });
    const filters = slotsToCatalogFilters({budget: 'tanio'}, 'coś taniego');
    await searchGemmaCatalog(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN: 'tok',
      } as never,
      'epir-online-store',
      filters,
      GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT,
    );
    expect(mcpSpy).toHaveBeenCalled();
    const mcpPayload = mcpSpy.mock.calls[0]![2] as {catalog: Record<string, unknown>};
    expect(mcpPayload.catalog.filters).toEqual({available: true});
    expect(Object.keys(mcpPayload.catalog.filters as object).sort()).toEqual(['available']);
    expect('query' in mcpPayload.catalog).toBe(false);
  });

  it('T-FIX-1: slotsToCatalogFilters tanio bez typu → browse (M-FIX-1)', () => {
    const filters = slotsToCatalogFilters({budget: 'tanio'}, 'coś taniego bym chciał');
    expect(filters.ucpBrowseInStockAvailable).toBe(true);
    expect(filters.text).toBeUndefined();
    expect(filters.priceMax).toBeUndefined();
    expect(filters.excludeGiftCards).toBe(true);
  });

  it('T-FIX-GC-1: coś taniego — pierwsza propozycja nie jest gift_card (M-FIX-gift)', async () => {
    const gift = fictionalMultiVariantProduct();
    gift.giftCard = true;
    gift.title = 'Karta podarunkowa';
    gift.variants = gift.variants.map((v) => ({...v, price: moneyFromMinor(2_000)}));
    const jewelry = fictionalMultiVariantProduct();
    jewelry.productId = 'gid://shopify/Product/900099';
    jewelry.variants = jewelry.variants.map((v) => ({...v, price: moneyFromMinor(120_000)}));
    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: vi.fn().mockResolvedValue({
        matches: [fictionalMatchFromProduct(gift), fictionalMatchFromProduct(jewelry)],
        total: 2,
        facets: {
          total: 2,
          byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
          byStone: {},
          byMetal: {},
          byProductType: {},
        },
      }),
    } as never);
    const filters = slotsToCatalogFilters({budget: 'tanio'}, 'coś taniego');
    const out = await searchGemmaCatalog(
      {PRIVATE_STOREFRONT_API_TOKEN: 'x'} as never,
      'epir-online-store',
      filters,
      GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT,
    );
    expect(out[0]!.product.giftCard).not.toBe(true);
    const top = await fetchGemmaCatalogMatchesForTurn({
      env: {PRIVATE_STOREFRONT_API_TOKEN: 'x'} as never,
      channelId: 'epir-online-store',
      slots: {budget: 'tanio'},
      userCorpus: 'coś taniego',
    });
    expect(top[0]!.match.product.giftCard).not.toBe(true);
  });

  it('R04: coś taniego — search z limitem 250 i browse; odpowiedź niepusta (M-FIX-1)', async () => {
    const searchSpy = vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([
      fictionalMatchFromProduct(fictionalMultiVariantProduct()),
    ]);
    await stubGemmaIntentJson({slots: {budget: 'tanio'}});
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'coś taniego',
      new Request('https://example.com'),
      {sessionId: 'sess_fix_r04'},
    );
    expect(searchSpy).toHaveBeenCalledWith(
      expect.anything(),
      'epir-online-store',
      expect.objectContaining({ucpBrowseInStockAvailable: true}),
      250,
      expect.anything(),
    );
    expect(reply).not.toBe(epirCatalogEmptyReply('epir-online-store'));
  });

  it('T-D-Z2-1: budżet słowny z tekstem UCP — limit 6, nie 250 (R03.1)', async () => {
    const searchSpy = vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([]);
    await stubGemmaIntentJson({
      state: 'propozycje',
      slots: {budget: 'tanio', recipient: 'żona'},
    });
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'skromnie i tanio',
      new Request('https://example.com'),
      {sessionId: 'sess_dz2_text_limit'},
    );
    expect(searchSpy).toHaveBeenCalledWith(
      expect.anything(),
      'epir-online-store',
      expect.objectContaining({text: expect.stringMatching(/żona|tanio/i)}),
      6,
      expect.anything(),
    );
  });

  it('R04-sort: qualitative sort ascending before display slice (M-FIX-6)', async () => {
    const cheap = fictionalMultiVariantProduct();
    const expensive = {...fictionalMultiVariantProduct(), productId: 'gid://shopify/Product/900088'};
    expensive.variants = expensive.variants.map((v) => ({
      ...v,
      price: moneyFromMinor(500_000),
    }));
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([
      fictionalMatchFromProduct(expensive),
      fictionalMatchFromProduct(cheap),
    ]);
    const top = await fetchGemmaCatalogMatchesForTurn({
      env: {} as never,
      channelId: 'epir-online-store',
      slots: {budget: 'tanio'},
      userCorpus: 'coś taniego',
    });
    expect(top[0]!.minMinor).toBeLessThan(top[1]!.minMinor);
  });

  it('R03: prezent dla żony, skromnie i tanio — karty (M-FIX-1)', async () => {
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([
      fictionalMatchFromProduct(fictionalMultiVariantProduct()),
    ]);
    await stubGemmaIntentJson({
      slots: {recipient: 'żona', occasion: 'prezent', budget: 'skromnie, tanio'},
    });
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent dla żony, skromnie i tanio',
      new Request('https://example.com'),
      {sessionId: 'sess_fix_r03'},
    );
    expect(reply).not.toBe(epirCatalogEmptyReply('epir-online-store'));
    expect(reply).toMatch(/\/products\//);
  });

  it('T-FIX-MCP-QUERY-1: query-path MCP error → catalogFailed (D3, M2 query guard)', async () => {
    vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      error: {code: -32602, message: 'invalid'},
    });
    await stubGemmaIntentJson({
      state: 'propozycje',
      slots: {recipient: 'żona', product_type: 'kolczyki'},
    });
    const logSpy = vi.spyOn(console, 'log');
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace, PRIVATE_STOREFRONT_API_TOKEN: 'x'} as never,
      'epir-online-store',
      'kolczyki dla żony',
      new Request('https://example.com'),
      {sessionId: 'sess_mcp_query'},
    );
    expect(reply).toBe(epirCatalogTransportReply('epir-online-store'));
    expect(
      logSpy.mock.calls.some((c) => {
        const raw = c[0];
        if (typeof raw !== 'string') return false;
        try {
          const j = JSON.parse(raw) as {tag?: string; catalog_failed?: boolean};
          return j.tag === 'gemma.turn' && j.catalog_failed === true;
        } catch {
          return false;
        }
      }),
    ).toBe(true);
  });

  it('T-FIX-MCP-BROWSE-1: browse MCP error → catalogFailed empty reply (M2 guard)', async () => {
    vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      error: {code: -32602, message: 'invalid'},
    });
    await stubGemmaIntentJson({state: 'propozycje', slots: {budget: 'tanio'}});
    const logSpy = vi.spyOn(console, 'log');
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace, PRIVATE_STOREFRONT_API_TOKEN: 'x'} as never,
      'epir-online-store',
      'coś taniego',
      new Request('https://example.com'),
      {sessionId: 'sess_mcp_browse'},
    );
    expect(reply).toBe(epirCatalogTransportReply('epir-online-store'));
    expect(
      logSpy.mock.calls.some((c) => {
        const raw = c[0];
        if (typeof raw !== 'string') return false;
        try {
          const j = JSON.parse(raw) as {tag?: string; catalog_failed?: boolean};
          return j.tag === 'gemma.turn' && j.catalog_failed === true;
        } catch {
          return false;
        }
      }),
    ).toBe(true);
  });

  it('T-FIX-MCP-ERR: MCP code → throw + gemma.catalog.error (M-FIX-3)', async () => {
    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: async () => {
        throw new CatalogMcpSearchError(-32602);
      },
    } as never);
    const logSpy = vi.spyOn(console, 'log');
    await expect(
      searchGemmaCatalog(
        {PRIVATE_STOREFRONT_API_TOKEN: 'x'} as never,
        'epir-online-store',
        {text: 'kolczyki'},
        6,
      ),
    ).rejects.toBeInstanceOf(CatalogMcpSearchError);
    expect(
      logSpy.mock.calls.some((c) => {
        const raw = c[0];
        if (typeof raw !== 'string') return false;
        try {
          const j = JSON.parse(raw) as {tag?: string; code?: number};
          return j.tag === 'gemma.catalog.error' && j.code === -32602;
        } catch {
          return false;
        }
      }),
    ).toBe(true);
  });

  it('T-FIX-MCP-compose: MCP error → catalogFailed path (empty template)', async () => {
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockRejectedValue(new CatalogMcpSearchError(-32602));
    await stubGemmaIntentJson({slots: {...FICTIONAL_CATALOG_READY_SLOTS}});
    const {namespace} = makeTrackedSessionNamespace();
    const reply = await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'fikcyjne',
      new Request('https://example.com'),
      {sessionId: 'sess_mcp_compose'},
    );
    expect(reply).toBe(epirCatalogTransportReply('epir-online-store'));
  });

  it('T-FIX-6: szablony bez prefiksu „Proszę Pana” (M-FIX-4)', () => {
    for (const text of listEpirTemplateStrings('epir-online-store')) {
      expect(templateStartsWithProszePana(text)).toBe(false);
    }
  });

  it('T-FIX-7: gemma.turn po turze (M-FIX-5)', async () => {
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([
      fictionalMatchFromProduct(fictionalMultiVariantProduct()),
    ]);
    await stubGemmaIntentJson({slots: {...FICTIONAL_CATALOG_READY_SLOTS}});
    const logSpy = vi.spyOn(console, 'log');
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'fikcyjne',
      new Request('https://example.com'),
      {sessionId: 'sess_fix_turn_log'},
    );
    expect(
      logSpy.mock.calls.some((c) => {
        const raw = c[0];
        if (typeof raw !== 'string') return false;
        try {
          const j = JSON.parse(raw) as {tag?: string; catalog_n?: number};
          return j.tag === 'gemma.turn' && j.catalog_n === 1;
        } catch {
          return false;
        }
      }),
    ).toBe(true);
  });

  it('T-FIX-4a: catalogCards > 0 → buyer_gemma_formulation invoked', async () => {
    const ai = await import('../../../src/ai-client');
    const intentJson = JSON.stringify(
      fictionalGemmaIntent({state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}}),
    );
    const groqSpy = vi.spyOn(ai, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') return intentJson;
      if (opts?.timingLabel === 'buyer_gemma_formulation') {
        return JSON.stringify({text: 'Panu lub Pani polecam {{g1}}.', product_refs: ['g1']});
      }
      return intentJson;
    });
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([
      fictionalMatchFromProduct(fictionalMultiVariantProduct()),
    ]);
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_fix_4a'},
    );
    expect(groqSpy.mock.calls.some((c) => c[2]?.timingLabel === 'buyer_gemma_formulation')).toBe(
      true,
    );
  });

  it('T-FIX-4b: catalogCards == 0 → buyer_gemma_formulation NOT invoked', async () => {
    const ai = await import('../../../src/ai-client');
    const intentJson = JSON.stringify(
      fictionalGemmaIntent({state: 'propozycje', slots: {...FICTIONAL_CATALOG_READY_SLOTS}}),
    );
    const groqSpy = vi.spyOn(ai, 'getGroqResponse').mockImplementation(async (_m, _e, opts) => {
      if (opts?.timingLabel === 'buyer_gemma_intent') return intentJson;
      return intentJson;
    });
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([]);
    const {namespace} = makeTrackedSessionNamespace();
    await composeGemmaReply(
      {SESSION_DO: namespace} as never,
      'epir-online-store',
      'prezent',
      new Request('https://example.com'),
      {sessionId: 'sess_fix_4b'},
    );
    expect(groqSpy.mock.calls.some((c) => c[2]?.timingLabel === 'buyer_gemma_formulation')).toBe(
      false,
    );
  });
});
