/**
 * Legacy buyer / facts repository — bez Gemma v2 (core_mode ≠ v2).
 * MCP args jak przed browse/MCP-throw w facts; błąd MCP → [].
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import {getCatalogRepository} from '../../../src/facts/index';
import * as mcpServer from '../../../src/mcp_server';
import type {Env} from '../../../src/config/bindings';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('legacy getCatalogRepository MCP contract', () => {
  it('T-LEGACY-MCP-1: search_catalog args unchanged (query + limit, no browse branch)', async () => {
    const mcpSpy = vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      result: {content: [{type: 'text', text: JSON.stringify({products: []})}]},
    });

    const repo = await getCatalogRepository(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN: 'tok',
      } as Env,
      'epir-online-store',
    );
    await repo.search({text: 'kolczyki'}, 10);

    expect(mcpSpy).toHaveBeenCalledWith(
      expect.anything(),
      'search_catalog',
      {
        catalog: {
          query: 'kolczyki',
          pagination: {limit: 10},
          context: {
            address_country: 'PL',
            language: 'pl',
            currency: 'PLN',
            intent: 'purchase',
          },
        },
      },
      'epir',
    );
  });

  it('T-LEGACY-MCP-2: MCP error code → empty matches (no throw)', async () => {
    vi.spyOn(mcpServer, 'callMcpToolDirect').mockResolvedValue({
      error: {code: -32602, message: 'invalid'},
    });

    const repo = await getCatalogRepository(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        PRIVATE_STOREFRONT_API_TOKEN: 'tok',
      } as Env,
      'epir-online-store',
    );
    const {matches, total} = await repo.search({text: 'kolczyki'}, 10);
    expect(matches).toEqual([]);
    expect(total).toBe(0);
  });
});
