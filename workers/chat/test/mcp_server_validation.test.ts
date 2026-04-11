import { afterEach, describe, expect, it, vi } from 'vitest';
import { callMcpToolDirect } from '../src/mcp_server';

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
});
