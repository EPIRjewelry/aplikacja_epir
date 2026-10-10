import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AI_PROFILE_HANDLE_BY_BUYER_CHANNEL,
  _buildStorefrontAuthHeadersForTest,
  buildAIProfilePrompt,
  clearAIProfileCache,
  fetchAIProfile,
  fetchAIProfileByHandle,
  invalidateAIProfileCacheForHandle,
} from '../src/ai-profile';

describe('AI profile helpers', () => {
  beforeEach(() => {
    clearAIProfileCache();
    vi.restoreAllMocks();
  });

  it('builds system prompt fragment without faq_theme', () => {
    const result = buildAIProfilePrompt({
      brand_voice: 'Warm luxury',
      core_values: 'Craftsmanship',
      promotion_rules: 'Free shipping over 500 PLN',
    });

    expect(result).toContain('Profil marki i styl rozmowy:');
    expect(result).toContain('Głos marki: Warm luxury');
    expect(result).toContain('Wartości: Craftsmanship');
    expect(result).toContain('Komunikacja korzyści: Free shipping over 500 PLN');
    expect(result).not.toContain('Tematy rozmów');
    expect(result).not.toContain('get_size_table');
  });

  it('omits empty profile fields from the prompt fragment', () => {
    const result = buildAIProfilePrompt({
      brand_voice: 'Warm luxury',
      core_values: '',
      promotion_rules: '',
    });

    expect(result).toContain('Głos marki: Warm luxury');
    expect(result).not.toContain('Wartości:');
    expect(result).not.toContain('Komunikacja korzyści:');
  });

  it('maps buyer channels to ai_profile handles', () => {
    expect(AI_PROFILE_HANDLE_BY_BUYER_CHANNEL['epir-online-store']).toBe('online-store');
    expect(AI_PROFILE_HANDLE_BY_BUYER_CHANNEL['kazka-hydrogen']).toBe('kazka');
    expect(AI_PROFILE_HANDLE_BY_BUYER_CHANNEL['epir-zareczyny']).toBe('zareczyny');
  });

  it('uses public vs private Storefront auth headers', () => {
    expect(_buildStorefrontAuthHeadersForTest('tok', { tokenKind: 'public' })).toEqual({
      'X-Shopify-Storefront-Access-Token': 'tok',
    });
    expect(
      _buildStorefrontAuthHeadersForTest('priv', { tokenKind: 'private', buyerIp: '203.0.113.1' }),
    ).toEqual({
      'Shopify-Storefront-Private-Token': 'priv',
      'Shopify-Storefront-Buyer-IP': '203.0.113.1',
    });
  });

  it('returns normalized AI profile from Storefront API response (by gid)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          metaobject: {
            fields: [
              { key: 'brand_voice', value: 'Warm, knowledgeable' },
              { key: 'core_values', value: 'Craftsmanship, storytelling' },
              { key: 'faq_theme', value: 'ignored in prompt' },
              { key: 'promotion_rules', value: 'Free shipping over 500 PLN' },
            ],
          },
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAIProfile(
      'gid://shopify/Metaobject/123',
      'mock-storefront-token',
      'test-shop.myshopify.com',
    );

    expect(result).toMatchObject({
      brand_voice: 'Warm, knowledgeable',
      core_values: 'Craftsmanship, storytelling',
      promotion_rules: 'Free shipping over 500 PLN',
    });
    expect(result?.faq_theme).toBe('ignored in prompt');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['X-Shopify-Storefront-Access-Token']).toBe('mock-storefront-token');
  });

  it('uses cache for repeated profile requests within TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          metaobject: {
            fields: [{ key: 'brand_voice', value: 'Warm' }],
          },
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    await fetchAIProfile('gid://shopify/Metaobject/123', 'mock-storefront-token', 'test-shop.myshopify.com');
    await fetchAIProfile('gid://shopify/Metaobject/123', 'mock-storefront-token', 'test-shop.myshopify.com');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to null when metaobject does not exist', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          metaobject: null,
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAIProfile(
      'gid://shopify/Metaobject/missing',
      'mock-storefront-token',
      'test-shop.myshopify.com',
    );

    expect(result).toBeNull();
  });

  it('fetchAIProfileByHandle rejects mismatched storefront_id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          metaobject: {
            fields: [
              { key: 'storefront_id', value: 'kazka' },
              { key: 'brand_voice', value: 'Should not load' },
            ],
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      SHOP_DOMAIN: 'test-shop.myshopify.com',
      PRIVATE_STOREFRONT_API_TOKEN: 'priv-os',
    } as import('../src/config/bindings').Env;

    const result = await fetchAIProfileByHandle(env, 'epir-online-store');
    expect(result).toBeNull();
  });

  it('fetchAIProfileByHandle loads profile when storefront_id matches handle', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          metaobject: {
            fields: [
              { key: 'storefront_id', value: 'online-store' },
              { key: 'brand_voice', value: 'EPIR tone' },
            ],
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      SHOP_DOMAIN: 'test-shop.myshopify.com',
      PRIVATE_STOREFRONT_API_TOKEN: 'priv-os',
    } as import('../src/config/bindings').Env;

    const result = await fetchAIProfileByHandle(env, 'epir-online-store', '198.51.100.2');
    expect(result?.brand_voice).toBe('EPIR tone');
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Shopify-Storefront-Private-Token']).toBe('priv-os');
    expect(headers['Shopify-Storefront-Buyer-IP']).toBe('198.51.100.2');
  });

  it('invalidateAIProfileCacheForHandle clears handle cache entry', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          metaobject: {
            fields: [
              { key: 'storefront_id', value: 'kazka' },
              { key: 'brand_voice', value: 'Kazka' },
            ],
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      SHOP_DOMAIN: 'test-shop.myshopify.com',
      PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv-kazka',
    } as import('../src/config/bindings').Env;

    await fetchAIProfileByHandle(env, 'kazka-hydrogen');
    invalidateAIProfileCacheForHandle('test-shop.myshopify.com', 'kazka');
    await fetchAIProfileByHandle(env, 'kazka-hydrogen');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
