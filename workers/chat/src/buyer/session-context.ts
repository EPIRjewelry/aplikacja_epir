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

/** `true`/`false` z klienta; brak pola = unknown (NULL w D1). */
export function extractAnalyticsConsentFromBody(body: unknown): 0 | 1 | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const raw = (body as {analytics_consent?: unknown}).analytics_consent;
  if (raw === true) return 1;
  if (raw === false) return 0;
  return undefined;
}

export function extractSessionIdSourceFromBody(
  body: unknown,
): 'cookie' | 'session_storage' | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const raw = (body as {session_id_source?: unknown}).session_id_source;
  if (raw === 'cookie' || raw === 'session_storage') return raw;
  return undefined;
}

/** Każda tura z session_id: kanoniczny session_id i storefront w SessionDO (join z pixel). */
export async function ensureBuyerSessionContext(
  env: Env,
  input: {
    sessionId?: string;
    channelId: BuyerChannelId;
    storefrontId?: string;
    bodyChannel?: string;
    userText: string;
    analyticsConsent?: 0 | 1;
    sessionIdSource?: 'cookie' | 'session_storage';
  },
): Promise<void> {
  const sid = input.sessionId?.trim();
  if (!sid || !env.SESSION_DO) return;

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
    if (input.analyticsConsent !== undefined || input.sessionIdSource) {
      const privacyBody: Record<string, unknown> = {};
      if (input.analyticsConsent !== undefined) {
        privacyBody.analytics_consent = input.analyticsConsent;
      }
      if (input.sessionIdSource) {
        privacyBody.session_id_source = input.sessionIdSource;
      }
      await postSession(env, sid, 'set-session-privacy', privacyBody);
    }
  } catch (e) {
    console.warn('[buyer.session_context] ensure failed', e);
  }
}
