import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAIProfilePrompt, clearAIProfileCache, fetchAIProfile } from '../src/ai-profile';

describe('AI profile helpers', () => {
  beforeEach(() => {
    clearAIProfileCache();
    vi.restoreAllMocks();
  });

  it('builds system prompt fragment from profile values', () => {
    const result = buildAIProfilePrompt({
      brand_voice: 'Warm luxury',
      core_values: 'Craftsmanship',
      faq_theme: 'Shipping',
      promotion_rules: 'Free shipping over 500 PLN',
    });

    expect(result).toContain('Brand Voice: Warm luxury');
    expect(result).toContain('Core Values: Craftsmanship');
    expect(result).toContain('FAQ Focus: Shipping');
    expect(result).toContain('Active Promotions: Free shipping over 500 PLN');
  });

  it('returns normalized AI profile from Storefront API response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          metaobject: {
            fields: [
              { key: 'brand_voice', value: 'Warm, knowledgeable' },
              { key: 'core_values', value: 'Craftsmanship, storytelling' },
              { key: 'faq_theme', value: 'Shipping & care' },
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
      'test-shop.myshopify.com'
    );

    expect(result).toEqual({
      brand_voice: 'Warm, knowledgeable',
      core_values: 'Craftsmanship, storytelling',
      faq_theme: 'Shipping & care',
      promotion_rules: 'Free shipping over 500 PLN',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses cache for repeated profile requests within TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          metaobject: {
            fields: [
              { key: 'brand_voice', value: 'Warm, knowledgeable' },
              { key: 'core_values', value: 'Craftsmanship, storytelling' },
              { key: 'faq_theme', value: 'Shipping & care' },
              { key: 'promotion_rules', value: 'Free shipping over 500 PLN' },
            ],
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
      'test-shop.myshopify.com'
    );

    expect(result).toBeNull();
  });
});