import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callShopifyMcpTool, __test as mcpTest } from '../src/shopify-mcp-client';

type KVStub = {
  store: Map<string, { value: string; ttl?: number }>;
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

function makeKvStub(): KVStub {
  const store = new Map<string, { value: string; ttl?: number }>();
  const get = vi.fn(async (key: string, type?: string) => {
    const entry = store.get(key);
    if (!entry) return null;
    return type === 'json' ? JSON.parse(entry.value) : entry.value;
  });
  const put = vi.fn(async (key: string, value: string, opts?: { expirationTtl?: number }) => {
    store.set(key, { value, ttl: opts?.expirationTtl });
  });
  return { store, get, put };
}

function makeMcpResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: body }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('normalizePolicyQuery', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(mcpTest.normalizePolicyQuery(' ZWROTY ')).toBe('zwroty');
    expect(mcpTest.normalizePolicyQuery('Polityka  ZWROTÓW   \n')).toBe('polityka zwrotów');
  });

  it('produces identical keys for case/whitespace variants', async () => {
    const a = await mcpTest.policiesCacheKey(' ZWROTY ');
    const b = await mcpTest.policiesCacheKey('zwroty');
    const c = await mcpTest.policiesCacheKey('Zwroty');
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toMatch(/^policies:v1:[0-9a-f]{64}$/);
  });

  it('produces different keys for different queries', async () => {
    const a = await mcpTest.policiesCacheKey('zwroty');
    const b = await mcpTest.policiesCacheKey('wysyłka');
    expect(a).not.toBe(b);
  });
});

describe('callShopifyMcpTool policies KV cache', () => {
  const env = {
    MCP_ENDPOINT: 'https://test.myshopify.com/api/mcp',
    POLICIES_CACHE: undefined as unknown as KVStub,
  };
  let kv: KVStub;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    kv = makeKvStub();
    env.POLICIES_CACHE = kv;
    fetchMock = vi.fn(async () =>
      makeMcpResponse({ answer: 'Zwroty w ciągu 14 dni.' }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('cache miss: fetches from MCP and writes to KV', async () => {
    const result = await callShopifyMcpTool(
      'search_shop_policies_and_faqs',
      { query: 'Jakie są zwroty?' },
      env as any,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ answer: expect.stringContaining('14 dni') });
    expect(kv.put).toHaveBeenCalledTimes(1);
    const [key, value, opts] = kv.put.mock.calls[0] as [string, string, { expirationTtl?: number }];
    expect(key).toMatch(/^policies:v1:[0-9a-f]{64}$/);
    expect(JSON.parse(value).payload).toMatchObject({ answer: expect.any(String) });
    expect(opts.expirationTtl).toBe(6 * 3600);
  });

  it('cache hit: returns KV payload without fetching MCP', async () => {
    // Warm cache
    await callShopifyMcpTool(
      'search_shop_policies_and_faqs',
      { query: 'zwroty' },
      env as any,
    );
    fetchMock.mockClear();
    // Same query, different casing → same key → should hit cache
    const result = await callShopifyMcpTool(
      'search_shop_policies_and_faqs',
      { query: 'ZWROTY' },
      env as any,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ answer: expect.stringContaining('14 dni') });
  });

  it('does NOT cache non-policies tools', async () => {
    fetchMock.mockImplementationOnce(async () =>
      makeMcpResponse({ products: [] }),
    );
    await callShopifyMcpTool(
      'search_catalog',
      { catalog: { query: 'obrączki' } },
      env as any,
    );
    expect(kv.put).not.toHaveBeenCalled();
    expect(kv.get).not.toHaveBeenCalled();
  });

  it('gracefully degrades when POLICIES_CACHE binding is missing', async () => {
    const envNoCache = { MCP_ENDPOINT: env.MCP_ENDPOINT };
    const result = await callShopifyMcpTool(
      'search_shop_policies_and_faqs',
      { query: 'test' },
      envNoCache as any,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ answer: expect.any(String) });
  });

  it('does NOT cache error responses', async () => {
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'boom' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await expect(
      callShopifyMcpTool(
        'search_shop_policies_and_faqs',
        { query: 'trigger-error' },
        env as any,
      ),
    ).rejects.toThrow(/Shopify MCP error/);
    expect(kv.put).not.toHaveBeenCalled();
  });
});
