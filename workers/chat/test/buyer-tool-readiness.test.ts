import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assessToolReadiness,
  interpretCustomerAccountHttpStatus,
  listAvailableBuyerTools,
} from '../src/buyer/tool-readiness';

describe('buyer tool-readiness', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

  it('ucp cart requires same agent profile envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', result: { tools: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      SHOP_DOMAIN: 'shop.myshopify.com',
      PRIVATE_STOREFRONT_API_TOKEN: 'priv',
      UCP_AGENT_PROFILE_URL: 'https://example.com/profile.json',
    } as import('../src/config/bindings').Env;

    const r = await assessToolReadiness(env, 'epir-online-store', 'ucp_cart');
    expect(r.available).toBe(true);
  });

  it('listAvailableBuyerTools omits tools that fail readiness', async () => {
    const env = { SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const tools = await listAvailableBuyerTools(env, 'kazka-hydrogen');
    expect(tools).not.toContain('search_catalog');
  });
});
