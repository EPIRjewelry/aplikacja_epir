import {afterEach, describe, expect, it, vi} from 'vitest';
import {callMcpToolDirect} from '../src/mcp_server';

const SHOP = 'epir-art-silver-jewellery.myshopify.com';

function mcpOk() {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: {content: [{type: 'text', text: '{"products":[{"title":"Gałązki"}]}'}]},
    }),
    {status: 200, headers: {'Content-Type': 'application/json'}},
  );
}

describe('search_catalog UCP payload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('posts Gałązki to /api/ucp/mcp with the required agent profile and a PLN budget in grosze', async () => {
    const fetchMock = vi.fn(async () => mcpOk());
    vi.stubGlobal('fetch', fetchMock);

    await callMcpToolDirect(
      {
        SHOP_DOMAIN: SHOP,
        WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl',
        MCP_ENDPOINT: `https://${SHOP}/api/mcp`,
      } as any,
      'search_catalog',
      {
        catalog: {
          query: 'Gałązki ametyst',
          filters: {
            price: {max: 5000},
            categories: ['pierścionki', 'gid://shopify/TaxonomyCategory/jg-1'],
          },
          pagination: {limit: 50},
        },
      },
      {
        brand: 'epir',
        commerceContext: {
          language: 'pl-PL',
          currency: 'PLN',
          address_country: 'PL',
          market: 'PL',
          locale: 'pl',
        },
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`https://${SHOP}/api/ucp/mcp`);
    expect(String(url)).not.toContain('/api/mcp');
    const body = JSON.parse(String(init.body));
    expect(body.params.name).toBe('search_catalog');
    expect(body.params.arguments.meta['ucp-agent'].profile).toBe(
      'https://shopify.dev/ucp/agent-profiles/2026-08-25/valid-with-capabilities.json',
    );
    expect(body.params.arguments.catalog.query).toBe('Gałązki ametyst');
    expect(body.params.arguments.catalog.pagination.limit).toBe(3);
    expect(body.params.arguments.catalog.filters).toEqual({
      price: {max: 500000},
      categories: ['gid://shopify/TaxonomyCategory/jg-1'],
    });
    expect(body.params.arguments.catalog.context.currency).toBe('PLN');
    expect(body.params.arguments.catalog.context.language).toBe('pl-PL');
  });

  it('does not rewrite a Kazka Soliter query into Admin tag/vendor syntax', async () => {
    const fetchMock = vi.fn(async () => mcpOk());
    vi.stubGlobal('fetch', fetchMock);

    await callMcpToolDirect(
      {
        SHOP_DOMAIN: SHOP,
        WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl',
      } as any,
      'search_catalog',
      {catalog: {query: 'Soliter', filters: {price: {max: 5000}}}},
      {
        brand: 'kazka',
        commerceContext: {
          language: 'pl-PL',
          currency: 'PLN',
          address_country: 'PL',
          market: 'PL',
          locale: 'pl',
        },
      },
    );

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.params.arguments.catalog.query).toBe('Soliter');
    expect(body.params.arguments.catalog.filters.price.max).toBe(500000);
    expect(body.params.arguments.catalog.pagination.limit).toBe(10);
    expect(body.params.arguments.meta['ucp-agent'].profile).toBe(
      'https://shopify.dev/ucp/agent-profiles/2026-08-25/valid-with-capabilities.json',
    );
  });

  it('logs and returns the Shopify HTTP 422 body instead of an empty product list', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: {code: -32001, message: 'UCP discovery failed', data: {code: 'profile_malformed'}},
        }),
        {status: 422, headers: {'Content-Type': 'application/json'}},
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await callMcpToolDirect(
      {
        SHOP_DOMAIN: SHOP,
        WORKER_ORIGIN: 'https://asystent.epirbizuteria.pl',
      } as any,
      'search_catalog',
      {catalog: {query: 'Gałązki ametyst'}},
      {brand: 'epir'},
    );

    expect((out as {error?: {code?: number; details?: string}}).error?.code).toBe(422);
    expect(String((out as {error?: {details?: string}}).error?.details)).toContain('UCP discovery failed');
    expect((out as {result?: {products?: unknown}}).result?.products).toBeUndefined();
    const logged = warn.mock.calls.find((call) => call[0] === '[mcp] catalog http error');
    expect(logged?.[1]).toMatchObject({
      tool: 'search_catalog',
      status: 422,
    });
    expect(String((logged?.[1] as {bodyPreview?: string})?.bodyPreview)).toContain('profile_malformed');
    expect(String((logged?.[1] as {profile?: string})?.profile)).toBe(
      'https://shopify.dev/ucp/agent-profiles/2026-08-25/valid-with-capabilities.json',
    );
  });
});
