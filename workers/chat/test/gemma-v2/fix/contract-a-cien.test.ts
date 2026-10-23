/**
 * Commission decision A — metal SSOT, URL, MCP metal/stone, cart copy, budget number.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  materialLabelMatchesSlotTokens,
  variantMetalMatchesSlotTokens,
} from '../../../src/facts/metal-match';
import {executeCatalogMcpLiveSearch} from '../../../src/facts/catalog-mcp-live';
import * as mcpServer from '../../../src/mcp_server';
import * as storefrontLive from '../../../src/facts/storefront-live';
import {runCatalogAction} from '../../../src/gemma/actions/catalog';
import {budgetMinorFromSlots} from '../../../src/gemma/actions/slots-to-filters';
import {searchGemmaCatalog} from '../../../src/gemma/facts/catalog-search';
import * as facts from '../../../src/facts';
import {fictionalMatchFromProduct, fictionalMultiVariantProduct} from '../fixtures/fictional-catalog-products';
import {DEFAULT_GEMMA_SESSION_STATE} from '../../../src/gemma/state/types';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';
import {moneyFromMinor} from '../../../src/facts/types';
import {epirCartReply} from '../../../src/gemma/profiles/epir';

describe('contract A — metal SSOT (exact labels)', () => {
  it('T-CONTRACT-A-METAL-1: gold ≠ gold-plated (no includes)', () => {
    expect(variantMetalMatchesSlotTokens('gold-plated', ['gold'])).toBe(false);
    expect(materialLabelMatchesSlotTokens('gold-plated', ['gold'])).toBe(false);
    expect(variantMetalMatchesSlotTokens('gold-plated', ['gold-plated'])).toBe(true);
  });

  it('T-CONTRACT-A-METAL-2: pozłacane + slot złoto → 0 (includes matcher byłby fałszywie 1)', async () => {
    const base = fictionalMultiVariantProduct();
    const product = {
      ...base,
      variants: [{...base.variants[0], metal: 'srebro pozłacane', price: moneyFromMinor(100_000)}],
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
    expect(out).toHaveLength(0);
  });
});

describe('contract A — budget number|null', () => {
  it('T-CONTRACT-A-BUD-1: slots.budget number bez regex-primary corpus digits', () => {
    expect(budgetMinorFromSlots({budget: 500}, 'bez liczb w tekście')).toBe(50_000);
  });
});

describe('contract A — URL handle out', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-CONTRACT-A-URL-1: brak product.url → drop z shown', async () => {
    const match = fictionalMatchFromProduct(fictionalMultiVariantProduct());
    match.product.url = '';
    vi.spyOn(await import('../../../src/gemma/facts/catalog-fetch-for-turn'), 'fetchGemmaCatalogMatchesForTurn').mockResolvedValue([
      {match, minMinor: 100_000},
    ]);
    const out = await runCatalogAction({
      env: {} as never,
      channelId: 'epir-online-store',
      request: new Request('https://example.com'),
      sessionId: 's',
      userText: 'x',
      userCorpus: 'x',
      intent: fictionalGemmaIntent(),
      prev: DEFAULT_GEMMA_SESSION_STATE,
      transitioned: {nextState: 'propozycje', slots: {}, allowedActions: ['search_catalog']},
    });
    expect(out.shown).toHaveLength(0);
    expect(out.cards).toHaveLength(0);
  });
});

describe('contract A — MCP metal/stone not silently cleared', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-CONTRACT-A-MCP-1: throwOnMcpError keeps metal filter in post-UCP filterProducts', async () => {
    vi.spyOn(storefrontLive, 'hasStorefrontCatalogToken').mockReturnValue(true);
    vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              products: [{id: 'gid://shopify/Product/900001'}],
            }),
          },
        ],
      },
    });
    const product = fictionalMultiVariantProduct();
    product.variants = [
      {...product.variants[0], metal: 'metal B', variantId: 'gid://shopify/ProductVariant/b'},
      {...product.variants[1], metal: 'metal A', variantId: 'gid://shopify/ProductVariant/a'},
    ];
    vi.spyOn(storefrontLive, 'fetchProductFactsLive').mockResolvedValue([product]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await executeCatalogMcpLiveSearch(
      {PRIVATE_STOREFRONT_API_TOKEN: 'tok'} as never,
      'epir-online-store',
      {metal: ['metal B']},
      10,
      {throwOnMcpError: true},
    );
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].matchingVariants.every((v) => v.metal === 'metal B')).toBe(true);
    const stages = logSpy.mock.calls
      .map((c) => c[0])
      .filter((line) => typeof line === 'string' && line.includes('post_ucp_local_metal_stone'));
    expect(stages.length).toBeGreaterThan(0);
    logSpy.mockRestore();
  });
});

describe('contract A — cart copy', () => {
  it('T-CONTRACT-A-CART-1: epirCartReply bez zgody nie obiecuje koszyka', () => {
    expect(epirCartReply(false, 'epir-online-store')).not.toMatch(/Zajmę się koszykiem/i);
  });
});
