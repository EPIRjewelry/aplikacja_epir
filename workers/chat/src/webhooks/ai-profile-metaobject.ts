import {
  AI_PROFILE_HANDLE_BY_BUYER_CHANNEL,
  invalidateAIProfileCacheForHandle,
} from '../ai-profile';
import type { Env } from '../config/bindings';
import { verifyHmac } from '../hmac';

const AI_PROFILE_HANDLES = new Set(Object.values(AI_PROFILE_HANDLE_BY_BUYER_CHANNEL));

export async function handleAiProfileMetaobjectWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const rawBodyBuffer = await request.arrayBuffer();
  const rawBodyBytes = new Uint8Array(rawBodyBuffer);
  const hmac = request.headers.get('X-Shopify-Hmac-Sha256');
  if (!env.SHOPIFY_APP_SECRET?.trim() || !hmac) {
    return new Response('Unauthorized', { status: 401 });
  }
  const validWebhook = await verifyHmac(hmac, env.SHOPIFY_APP_SECRET, rawBodyBytes);
  if (!validWebhook) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: { type?: string; handle?: string };
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBodyBytes)) as {
      type?: string;
      handle?: string;
    };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (payload.type !== 'ai_profile') {
    return new Response(JSON.stringify({ ok: true, skipped: 'type' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const handle = payload.handle?.trim();
  if (!handle || !AI_PROFILE_HANDLES.has(handle)) {
    return new Response(JSON.stringify({ ok: true, skipped: 'handle' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const shop = env.SHOP_DOMAIN?.trim();
  if (shop) {
    invalidateAIProfileCacheForHandle(shop, handle);
  }

  return new Response(JSON.stringify({ ok: true, invalidated: handle }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
