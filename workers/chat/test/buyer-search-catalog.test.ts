import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeBuyerTool } from '../src/buyer/execute-buyer-tool';
import { validateSearchCatalogArgs } from '../src/buyer/search-catalog-args';
import * as facts from '../src/facts';
import * as mcpServer from '../src/mcp_server';

describe('search_catalog buyer tool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('validateSearchCatalogArgs rejects extra fields and invalid prices', () => {
    expect(validateSearchCatalogArgs({ query: 'ab', foo: 1 }).ok).toBe(false);
    expect(validateSearchCatalogArgs({ query: 'ok', price_min_pln: 1.5 }).ok).toBe(false);
    expect(validateSearchCatalogArgs({ query: 'ok', price_min_pln: 100, price_max_pln: 50 }).ok).toBe(
      false,
    );
  });

  it('execute search_catalog passes price_max_pln as minor units to repository search', async () => {
    const searchSpy = vi.fn().mockResolvedValue({
      matches: [],
      total: 0,
      facets: {
        total: 0,
        byOrigin: { natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0 },
        byStone: {},
        byMetal: {},
        byProductType: {},
      },
    });
    vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
      search: searchSpy,
    } as never);
    vi.spyOn(mcpServer, 'callMcpToolDirect');

    await executeBuyerTool({
      env: { SHOP_DOMAIN: 'shop.myshopify.com', PRIVATE_STOREFRONT_API_TOKEN: 'x' } as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['search_catalog'],
      name: 'search_catalog',
      argsJson: JSON.stringify({ query: 'pierścionek', price_max_pln: 5000 }),
      sessionCartId: null,
      allowedVariantIds: new Set(),
      request: new Request('https://example.com'),
    });

    expect(searchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'pierścionek', priceMax: 500_000 }),
      10,
    );
  });
});
