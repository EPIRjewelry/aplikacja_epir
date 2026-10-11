import type {Env} from '../config/bindings';
import {resolveStorefrontConfig} from '../config/storefronts';
import type {BuyerChannelId} from './channel-switch';

function sessionStub(env: Env, sessionId: string) {
  const sid = sessionId.trim();
  if (!sid) throw new Error('session_id required');
  return env.SESSION_DO.get(env.SESSION_DO.idFromName(sid));
}

async function postSession(
  env: Env,
  sessionId: string,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  const stub = sessionStub(env, sessionId);
  const res = await stub.fetch(`https://session/${path}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`${path} HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
}

export function extractStorefrontIdFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as {storefrontId?: unknown; storefront_id?: unknown};
  const raw = rec.storefrontId ?? rec.storefront_id;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

export function extractChannelFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const raw = (body as {channel?: unknown}).channel;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

const ensuredTurns = new Set<string>();

function turnKey(sessionId: string, userText: string): string {
  return `${sessionId}::${userText}`;
}

/** Raz na turę: kanoniczny session_id i storefront w SessionDO (join z pixel). */
export async function ensureBuyerSessionContext(
  env: Env,
  input: {
    sessionId?: string;
    channelId: BuyerChannelId;
    storefrontId?: string;
    bodyChannel?: string;
    userText: string;
  },
): Promise<void> {
  const sid = input.sessionId?.trim();
  if (!sid || !env.SESSION_DO) return;

  const key = turnKey(sid, input.userText);
  if (ensuredTurns.has(key)) return;
  ensuredTurns.add(key);

  const sfConfig = resolveStorefrontConfig(env, input.storefrontId);
  const channel =
    input.bodyChannel?.trim() ||
    sfConfig?.channel ||
    (input.channelId === 'kazka-hydrogen'
      ? 'hydrogen-kazka'
      : input.channelId === 'epir-zareczyny'
        ? 'hydrogen-zareczyny'
        : 'online-store');

  console.log(
    JSON.stringify({
      tag: 'buyer.session',
      channel,
      sid: sid.slice(0, 8),
      hasSessionId: true,
    }),
  );

  try {
    await postSession(env, sid, 'set-session-id', {session_id: sid});
    if (input.storefrontId?.trim() || channel) {
      await postSession(env, sid, 'set-storefront-context', {
        storefront_id: input.storefrontId?.trim() ?? null,
        channel,
      });
    }
  } catch (e) {
    ensuredTurns.delete(key);
    console.warn('[buyer.session_context] ensure failed', e);
  }
}

/** Tylko testy — reset pamięci „raz na turę”. */
export function resetBuyerSessionContextTurnCache(): void {
  ensuredTurns.clear();
}
