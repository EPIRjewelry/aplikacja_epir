import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAIProfileCache, fetchAIProfileByHandle } from '../src/ai-profile';
import { handleAiProfileMetaobjectWebhook } from '../src/webhooks/ai-profile-metaobject';
import * as hmac from '../src/hmac';

describe('ai_profile metaobject webhook', () => {
  beforeEach(() => {
    clearAIProfileCache();
    vi.restoreAllMocks();
  });

  it('returns 401 when HMAC invalid', async () => {
    vi.spyOn(hmac, 'verifyHmac').mockResolvedValue(false);
    const env = { SHOPIFY_APP_SECRET: 'secret', SHOP_DOMAIN: 'shop.myshopify.com' } as import('../src/config/bindings').Env;
    const req = new Request('https://example.com/webhooks/metaobjects/ai_profile', {
      method: 'POST',
      headers: { 'X-Shopify-Hmac-Sha256': 'bad' },
      body: JSON.stringify({ type: 'ai_profile', handle: 'kazka' }),
    });
    const res = await handleAiProfileMetaobjectWebhook(req, env);
    expect(res.status).toBe(401);
  });

  it('invalidates cache for ai_profile handle on valid HMAC', async () => {
    vi.spyOn(hmac, 'verifyHmac').mockResolvedValue(true);
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
      SHOP_DOMAIN: 'shop.myshopify.com',
      SHOPIFY_APP_SECRET: 'secret',
      PRIVATE_STOREFRONT_API_TOKEN_KAZKA: 'priv',
    } as import('../src/config/bindings').Env;

    await fetchAIProfileByHandle(env, 'kazka-hydrogen');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const req = new Request('https://example.com/webhooks/metaobjects/ai_profile', {
      method: 'POST',
      headers: { 'X-Shopify-Hmac-Sha256': 'ok' },
      body: JSON.stringify({ type: 'ai_profile', handle: 'kazka' }),
    });
    const res = await handleAiProfileMetaobjectWebhook(req, env);
    expect(res.status).toBe(200);

    await fetchAIProfileByHandle(env, 'kazka-hydrogen');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
