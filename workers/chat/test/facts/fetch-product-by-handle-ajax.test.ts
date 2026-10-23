import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Env} from '../../src/config/bindings';
import {fetchProductFactsByHandle} from '../../src/facts/storefront-live';
import {fictionalAjaxSilverGarnetRing} from '../fixtures/ajax-silver-garnet-ring';

afterEach(() => {
  vi.restoreAllMocks();
});

const env = {
  SHOP_DOMAIN: 'epir-ai.myshopify.com',
  PRIVATE_STOREFRONT_API_TOKEN: 'priv',
} as Env;

describe('fetchProductFactsByHandle Ajax fallback', () => {
  it('T-HANDLE-AJAX-1: SF product null + .js 200 → facts', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('graphql.json')) {
        return new Response(JSON.stringify({data: {product: null}}), {status: 200});
      }
      if (url.endsWith('/products/pierscionek-srebrny-z-granatem.js')) {
        return new Response(JSON.stringify(fictionalAjaxSilverGarnetRing()), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        });
      }
      return new Response('not found', {status: 404});
    });

    const facts = await fetchProductFactsByHandle(
      env,
      'epir-online-store',
      'pierscionek-srebrny-z-granatem',
    );
    expect(facts).not.toBeNull();
    expect(facts!.handle).toBe('pierscionek-srebrny-z-granatem');
    expect(facts!.variants[0]?.price.minor).toBe(34_000);
  });
});
