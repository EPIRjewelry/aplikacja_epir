import type {Env} from '../config/bindings';
import type {BrandLockResult} from '../brand-lock';
import {channelIdFromBrandLock, readChannelMode} from './channel-switch';

function buyerResponseHeaders(env: Env, request: Request): Record<string, string> {
  const requestOrigin = request.headers.get('Origin');
  const allowedOrigins = (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  let allowOrigin = '*';
  if (requestOrigin && allowedOrigins.length > 0 && allowedOrigins.includes(requestOrigin)) {
    allowOrigin = requestOrigin;
  } else if (!requestOrigin && allowedOrigins.length === 1) {
    allowOrigin = allowedOrigins[0];
  }
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Brand',
  };
}

export const BUYER_UNAVAILABLE_JSON = {
  type: 'unavailable' as const,
  reason: 'channel_off' as const,
  reply:
    'Czat jest chwilowo niedostępny. Zapraszamy do kontaktu przez formularz na stronie.',
};

/**
 * Etap 1: kupujący zawsze dostaje komunikat o niedostępności (fail-closed).
 * Bez modelu, bez SessionDO / D1 / pamięci sesji.
 */
export async function handleBuyerTurn(
  request: Request,
  env: Env,
  brandLock: BrandLockResult,
): Promise<Response> {
  const channelId = channelIdFromBrandLock(brandLock);
  const mode = channelId ? await readChannelMode(env, channelId) : 'off';
  console.log(
    JSON.stringify({
      tag: 'chat.buyer_gate',
      channel_id: channelId,
      mode,
      brand_key: brandLock.brandKey,
      server_channel: brandLock.channel,
    }),
  );
  return new Response(JSON.stringify(BUYER_UNAVAILABLE_JSON), {
    status: 200,
    headers: buyerResponseHeaders(env, request),
  });
}
