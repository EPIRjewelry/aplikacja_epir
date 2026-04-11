import { afterEach, describe, expect, it, vi } from 'vitest';
import { callMcpToolDirect, handleToolsCall } from '../src/mcp_server';

describe('callMcpToolDirect validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects missing catalog.query for search_catalog before fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      SHOP_DOMAIN: 'example.myshopify.com',
      MCP_ENDPOINT: 'https://example.myshopify.com/api/mcp',
    } as any;

    const result = await callMcpToolDirect(env, 'search_catalog', { catalog: { context: { intent: 'biżuteria' } } });

    expect((result as any).error?.code).toBe(-32602);
    expect(String((result as any).error?.message)).toContain('query');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clamps search_catalog catalog.pagination.limit to 3 on outbound MCP call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: '{"products":[]}' }] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      SHOP_DOMAIN: 'example.myshopify.com',
      MCP_ENDPOINT: 'https://example.myshopify.com/api/mcp',
    } as any;

    await callMcpToolDirect(env, 'search_catalog', {
      catalog: { query: 'rings', pagination: { limit: 50 } },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.params.arguments.catalog.pagination.limit).toBe(3);
  });

  it('returns ring size table content from Shopify metaobject for get_size_table', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            metaobject: {
              fields: [
                { key: 'table_content', value: 'PL 12 | US 6 | UK L | średnica 16.5 mm | obwód 52 mm' },
              ],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      SHOP_DOMAIN: 'example.myshopify.com',
      SHOPIFY_STOREFRONT_TOKEN: 'storefront-token',
      MCP_ENDPOINT: 'https://example.myshopify.com/api/mcp',
    } as any;

    const result = await callMcpToolDirect(env, 'get_size_table', {});

    expect((result as any).result).toEqual({
      content: 'PL 12 | US 6 | UK L | średnica 16.5 mm | obwód 52 mm',
      source: 'shopify_metaobject',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/2024-10/graphql.json');
    expect(String((fetchMock.mock.calls[0][1] as RequestInit).body)).toContain('tabela_rozmiarow');
  });

  it('returns fallback text for get_size_table when Storefront API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Storefront down')));

    const env = {
      SHOP_DOMAIN: 'example.myshopify.com',
      SHOPIFY_STOREFRONT_TOKEN: 'storefront-token',
    } as any;

    const result = await callMcpToolDirect(env, 'get_size_table', {});

    expect((result as any).result?.source).toBe('fallback');
    expect(String((result as any).result?.content)).toContain('tabela rozmiarów');
  });

  it('exposes get_size_table in tools/list', async () => {
    const response = await handleToolsCall(
      {
        SHOP_DOMAIN: 'example.myshopify.com',
        SHOPIFY_STOREFRONT_TOKEN: 'storefront-token',
      } as any,
      new Request('https://asystent.epirbizuteria.pl/mcp/tools/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      }),
    );

    const payload = (await response.json()) as { result?: { tools?: Array<{ name?: string }> } };
    const toolNames = (payload.result?.tools ?? []).map((tool) => tool.name);
    expect(toolNames).toContain('get_size_table');
  });
});
