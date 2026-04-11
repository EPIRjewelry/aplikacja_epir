import { describe, expect, it, vi, afterEach } from 'vitest';
import { callMcpToolDirect } from '../src/mcp_server';

const baseEnv = {
  SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
  MCP_ENDPOINT: 'https://epir-art-silver-jewellery.myshopify.com/api/mcp',
};

describe('Shop MCP search_shop_policies_and_faqs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retries on AbortError and succeeds when a later attempt returns 200', async () => {
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        attempts += 1;
        if (attempts < 2) {
          const e = new Error('The operation was aborted');
          e.name = 'AbortError';
          throw e;
        }
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: { content: [{ type: 'text', text: '[]' }] },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const out = await callMcpToolDirect(
      baseEnv as any,
      'search_shop_policies_and_faqs',
      { query: 'lokalizacja', context: 'test' },
    );

    expect(out.error).toBeUndefined();
    expect(out.result).toBeDefined();
    expect(attempts).toBe(2);
  });

  it('returns error JSON after exhausting retries on persistent AbortError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const e = new Error('The operation was aborted');
        e.name = 'AbortError';
        throw e;
      }),
    );

    const out = await callMcpToolDirect(
      baseEnv as any,
      'search_shop_policies_and_faqs',
      { query: 'zwroty', context: 'test' },
    );

    expect(out.result).toBeUndefined();
    expect(out.error).toMatchObject({
      message: 'Shop MCP call failed',
    });
    expect(String((out.error as { details?: string }).details)).toContain('aborted');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });

  it('does not multi-retry search_catalog on AbortError (uses catalog fallback path)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const e = new Error('The operation was aborted');
        e.name = 'AbortError';
        throw e;
      }),
    );

    const out = await callMcpToolDirect(baseEnv as any, 'search_catalog', {
      catalog: {
        query: 'bransoletka',
        context: { intent: 'test' },
      },
    });

    expect(out.error).toBeUndefined();
    expect(out.result).toMatchObject({
      products: [],
      system_note: expect.stringContaining('niedostępny'),
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
