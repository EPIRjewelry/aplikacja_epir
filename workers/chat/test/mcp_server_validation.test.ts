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

  it('passes search_catalog catalog.pagination.limit through (no hard clamp to 3)', async () => {
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
      WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl',
      MCP_ENDPOINT: 'https://example.myshopify.com/api/mcp',
    } as any;

    await callMcpToolDirect(env, 'search_catalog', {
      catalog: { query: 'rings', pagination: { limit: 50 } },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/ucp/mcp');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.params.arguments.catalog.pagination.limit).toBe(50);
    expect(body.params.arguments.meta).toEqual({
      'ucp-agent': {
        profile: 'https://asystent.epirbizuteria.pl/.well-known/ucp-agent-profile.json',
      },
    });
  });

  it('injects UCP agent profile on search_catalog without model-provided meta', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: '{"products":[{"title":"Gałązki"}]}' }] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      SHOP_DOMAIN: 'example.myshopify.com',
      WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl',
    } as any;

    await callMcpToolDirect(env, 'search_catalog', {
      catalog: { query: 'Gałązki' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/ucp/mcp');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.params.arguments.meta).toEqual({
      'ucp-agent': {
        profile: 'https://asystent.epirbizuteria.pl/.well-known/ucp-agent-profile.json',
      },
    });
    expect(body.params.arguments.catalog.query).toBe('Gałązki');
  });

  it('injects UCP agent profile on lookup_catalog', async () => {
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
      WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl',
    } as any;

    await callMcpToolDirect(env, 'lookup_catalog', {
      ids: ['gid://shopify/Product/1'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/ucp/mcp');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.params.arguments.meta).toEqual({
      'ucp-agent': {
        profile: 'https://asystent.epirbizuteria.pl/.well-known/ucp-agent-profile.json',
      },
    });
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
    expect(toolNames).toContain('create_cart');
    expect(toolNames).toContain('cancel_cart');
  });

  it('sends get_cart to Cart MCP with ucp-agent profile and returns continue_url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      cartMcpResponse({
        id: 'gid://shopify/Cart/abc',
        continue_url: 'https://shop.example/cart/c/abc',
        line_items: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const env = cartEnv();

    const out = await callMcpToolDirect(env, 'get_cart', { cart_id: 'gid://shopify/Cart/abc' });

    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/ucp/mcp');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.params.name).toBe('get_cart');
    expect(body.params.arguments.id).toBe('gid://shopify/Cart/abc');
    expect(body.params.arguments.meta['ucp-agent'].profile).toBe(
      'https://asystent.epirbizuteria.pl/.well-known/ucp-agent-profile.json',
    );
    expect((out as any).result.continue_url).toBe('https://shop.example/cart/c/abc');
    expect((out as any).result.checkout_url).toBe('https://shop.example/cart/c/abc');
  });

  it('replaces the whole cart on update_cart line_items', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      cartMcpResponse({
        id: 'gid://shopify/Cart/abc',
        continue_url: 'https://shop.example/cart/c/abc',
        line_items: [{ quantity: 1, item: { id: 'gid://shopify/ProductVariant/2' } }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await callMcpToolDirect(cartEnv(), 'update_cart', {
      cart_id: 'gid://shopify/Cart/abc',
      line_items: [{ quantity: 1, item: { id: 'gid://shopify/ProductVariant/2' } }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.params.name).toBe('update_cart');
    expect(body.params.arguments.cart.line_items).toEqual([
      { quantity: 1, item: { id: 'gid://shopify/ProductVariant/2' } },
    ]);
    expect(body.params.arguments.meta['ucp-agent'].profile).toContain('ucp-agent-profile.json');
  });

  it('merges a legacy add_items patch onto the current cart before replace', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        cartMcpResponse({
          id: 'gid://shopify/Cart/abc',
          line_items: [
            {
              id: 'gid://shopify/CartLine/1',
              quantity: 1,
              item: { id: 'gid://shopify/ProductVariant/1' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        cartMcpResponse({
          id: 'gid://shopify/Cart/abc',
          continue_url: 'https://shop.example/cart/c/abc',
          line_items: [],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await callMcpToolDirect(cartEnv(), 'update_cart', {
      cart_id: 'gid://shopify/Cart/abc',
      add_items: [{ product_variant_id: 'gid://shopify/ProductVariant/2', quantity: 1 }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const second = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(first.params.name).toBe('get_cart');
    expect(second.params.name).toBe('update_cart');
    expect(second.params.arguments.cart.line_items).toEqual([
      { quantity: 1, item: { id: 'gid://shopify/ProductVariant/1' } },
      { quantity: 1, item: { id: 'gid://shopify/ProductVariant/2' } },
    ]);
  });
});

function cartEnv() {
  return {
    SHOP_DOMAIN: 'example.myshopify.com',
    WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl',
  } as any;
}

function cartMcpResponse(cart: Record<string, unknown>) {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: {
        structuredContent: { cart },
        content: [{ type: 'text', text: JSON.stringify({ cart }) }],
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
