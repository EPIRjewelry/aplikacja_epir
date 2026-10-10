import type {Env} from '../config/bindings';
import type {ChatBrandLock} from '../brand-lock';
import {composeBuyerAssistantReply, extractLastUserMessage} from './compose-buyer-turn';
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
 * Kupujący: fail-closed gdy `gemma:channel:*` = off (domyślnie).
 * Tura z modelem tylko przy `internal` lub `on` (KV ustawia operator).
 */
export async function handleBuyerTurn(
  request: Request,
  env: Env,
  brandLock: ChatBrandLock,
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

  if (!channelId || mode === 'off') {
    return new Response(JSON.stringify(BUYER_UNAVAILABLE_JSON), {
      status: 200,
      headers: buyerResponseHeaders(env, request),
    });
  }

  if (mode !== 'internal' && mode !== 'on') {
    return new Response(JSON.stringify(BUYER_UNAVAILABLE_JSON), {
      status: 200,
      headers: buyerResponseHeaders(env, request),
    });
  }

  const body = await request.json().catch(() => null);
  const userText = extractLastUserMessage(body);
  if (!userText) {
    return new Response(JSON.stringify({ type: 'error', reason: 'missing_user_message' }), {
      status: 400,
      headers: buyerResponseHeaders(env, request),
    });
  }

  try {
    const reply = await composeBuyerAssistantReply(env, channelId, userText, request);
    return new Response(JSON.stringify({ type: 'message', reply, channel_id: channelId, mode }), {
      status: 200,
      headers: buyerResponseHeaders(env, request),
    });
  } catch (e) {
    console.error('[buyer.handle_turn] failed', e);
    return new Response(JSON.stringify({ type: 'error', reason: 'assistant_failed' }), {
      status: 500,
      headers: buyerResponseHeaders(env, request),
    });
  }
}
