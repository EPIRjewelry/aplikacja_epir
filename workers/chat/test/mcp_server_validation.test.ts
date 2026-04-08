import { afterEach, describe, expect, it, vi } from 'vitest';
import { callMcpToolDirect } from '../src/mcp_server';

describe('callMcpToolDirect validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects missing query for search_shop_catalog before fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      SHOP_DOMAIN: 'example.myshopify.com',
      MCP_ENDPOINT: 'https://example.myshopify.com/api/mcp',
    } as any;

    const result = await callMcpToolDirect(env, 'search_shop_catalog', { context: 'biżuteria' });

    expect((result as any).error?.code).toBe(-32602);
    expect(String((result as any).error?.message)).toContain('query');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
