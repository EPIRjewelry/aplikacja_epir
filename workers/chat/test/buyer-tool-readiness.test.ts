import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _clearBuyerToolReadinessCache,
  assessToolReadiness,
  interpretCustomerAccountHttpStatus,
  listAvailableBuyerTools,
} from '../src/buyer/tool-readiness';

function toolsListResponse(names: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      jsonrpc: '2.0',
      result: { tools: names.map((name) => ({ name })) },
    }),
  };
}

describe('buyer tool-readiness', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _clearBuyerToolReadinessCache();
  });

  it('fails catalog when storefront token missing', async () => {
    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const r = await assessToolReadiness(env, 'epir-online-store', 'search_catalog');
    expect(r.available).toBe(false);
    expect(r.reason).toBe('missing_storefront_catalog_token');
  });

  it('treats customer account 401 as guest not outage', () => {
    const r = interpretCustomerAccountHttpStatus(401);
    expect(r.guestNotLoggedIn).toBe(true);
    expect(r.available).toBe(false);
    expect(r.reason).toBe('customer_not_logged_in');
  });

  it('routes customer account probe 401 through interpretCustomerAccountHttpStatus', async () => {
    const env = {
      SHOP_DOMAIN: 'shop.myshopify.com',
      PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: 'caa-client',
    } as import('../src/config/bindings').Env;

    const r = await assessToolReadiness(env, 'epir-online-store', 'customer_account_profile', {
      customerAccountHttpStatus: 401,
    });
    expect(r.guestNotLoggedIn).toBe(true);
    expect(r.available).toBe(false);
    expect(r.reason).toBe('customer_not_logged_in');
  });

  it('marks UCP catalog unavailable on 401 (not guest)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      SHOP_DOMAIN: 'shop.myshopify.com',
      PRIVATE_STOREFRONT_API_TOKEN: 'priv',
      UCP_AGENT_PROFILE_URL: 'https://example.com/profile.json',
    } as import('../src/config/bindings').Env;

    const r = await assessToolReadiness(env, 'epir-online-store', 'search_catalog');
    expect(r.available).toBe(false);
    expect(r.guestNotLoggedIn).toBeUndefined();
    expect(r.reason).toBe('catalog_mcp_unhealthy_401');
  });

  it('marks policies MCP unavailable on 403 (not guest)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      SHOP_DOMAIN: 'shop.myshopify.com',
    } as import('../src/config/bindings').Env;

    const r = await assessToolReadiness(
      env,
      'epir-online-store',
      'search_shop_policies_and_faqs',
    );
    expect(r.available).toBe(false);
    expect(r.guestNotLoggedIn).toBeUndefined();
    expect(r.reason).toBe('policies_mcp_unhealthy_403');
  });

  it('ucp cart requires tools/list to include create_cart get_cart update_cart', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      toolsListResponse(['create_cart', 'get_cart', 'update_cart', 'cancel_cart']),
    );
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      SHOP_DOMAIN: 'shop.myshopify.com',
      PRIVATE_STOREFRONT_API_TOKEN: 'priv',
      UCP_AGENT_PROFILE_URL: 'https://example.com/profile.json',
    } as import('../src/config/bindings').Env;

    const r = await assessToolReadiness(env, 'epir-online-store', 'ucp_cart');
    expect(r.available).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/ucp/mcp');
  });

  it('tools/list 200 without create_cart ⇒ ucp_cart unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(toolsListResponse(['get_cart'])));
    const env = {
      SHOP_DOMAIN: 'shop.myshopify.com',
      PRIVATE_STOREFRONT_API_TOKEN: 'priv',
      UCP_AGENT_PROFILE_URL: 'https://example.com/profile.json',
    } as import('../src/config/bindings').Env;

    const r = await assessToolReadiness(env, 'epir-online-store', 'ucp_cart');
    expect(r.available).toBe(false);
    expect(r.reason).toBe('cart_tools_missing_from_list');
  });

  it('policies tools/list must include search_shop_policies_and_faqs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(toolsListResponse(['search_shop_policies_and_faqs'])),
    );
    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const r = await assessToolReadiness(
      env,
      'epir-online-store',
      'search_shop_policies_and_faqs',
    );
    expect(r.available).toBe(true);
  });

  it('9b readiness cache: second call in TTL without fetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(toolsListResponse(['create_cart', 'get_cart', 'update_cart']));
    vi.stubGlobal('fetch', fetchMock);
    const env = {
      SHOP_DOMAIN: 'shop.myshopify.com',
      PRIVATE_STOREFRONT_API_TOKEN: 'priv',
      UCP_AGENT_PROFILE_URL: 'https://example.com/profile.json',
    } as import('../src/config/bindings').Env;

    await assessToolReadiness(env, 'epir-online-store', 'ucp_cart');
    await assessToolReadiness(env, 'epir-online-store', 'ucp_cart');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('listAvailableBuyerTools omits tools that fail readiness', async () => {
    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const tools = await listAvailableBuyerTools(env, 'kazka-hydrogen');
    expect(tools).not.toContain('search_catalog');
  });
});
