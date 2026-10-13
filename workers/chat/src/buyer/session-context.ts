import type {Env} from '../config/bindings';
import {resolveStorefrontConfig} from '../config/storefronts';
import type {BuyerChannelId} from './channel-switch';

function sessionStub(env: Env, sessionId: string) {
  const sid = sessionId.trim();
  if (!sid) throw new Error('session_id required');
  return env.SESSION_DO.get(env.SESSION_DO.idFromName(sid));
}

export async function postBuyerSessionPrivacy(
  env: Env,
  sessionId: string,
  patch: {
    analyticsConsent?: 0 | 1;
    sessionIdSource?: 'cookie' | 'session_storage';
    analyticsClientId?: string | null;
  },
): Promise<void> {
  const sid = sessionId.trim();
  if (!sid || !env.SESSION_DO) return;
  const privacyBody: Record<string, unknown> = {};
  if (patch.analyticsConsent === 0) {
    privacyBody.analytics_consent = 0;
    privacyBody.analytics_client_id = null;
  } else if (patch.analyticsConsent === 1) {
    privacyBody.analytics_consent = 1;
    if (patch.analyticsClientId !== undefined) {
      privacyBody.analytics_client_id = patch.analyticsClientId;
    }
  }
  if (patch.sessionIdSource) {
    privacyBody.session_id_source = patch.sessionIdSource;
  }
  if (Object.keys(privacyBody).length === 0) return;
  await postSession(env, sid, 'set-session-privacy', privacyBody);
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

/** Sesja „znana” = wiersz w D1 `sessions` lub stan SessionDO po turze kupującego (bez tworzenia nowej). */
export async function isBuyerChatSessionKnown(
  env: Env,
  sessionId: string,
): Promise<boolean> {
  const sid = sessionId.trim();
  if (!sid) return false;

  if (env.DB_CHATBOT) {
    try {
      const row = await env.DB_CHATBOT
        .prepare('SELECT session_id FROM sessions WHERE session_id = ? LIMIT 1')
        .bind(sid)
        .first<{session_id: string}>();
      if (row?.session_id) return true;
    } catch (error) {
      console.warn(
        JSON.stringify({
          tag: 'buyer.session_privacy.d1_probe_failed',
          sid: sid.slice(0, 8),
          error: String((error as Error).message).slice(0, 120),
        }),
      );
    }
  }

  if (!env.SESSION_DO) return false;

  try {
    const stub = sessionStub(env, sid);
    const res = await stub.fetch('https://session/buyer-session-known');
    if (!res.ok) return false;
    const payload = (await res.json().catch(() => null)) as {known?: boolean} | null;
    return payload?.known === true;
  } catch {
    return false;
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

/** Pixel `clientId` / `_shopify_y` — tylko przy `analytics_consent: true`. */
export function extractAnalyticsClientIdFromBody(
  body: unknown,
): string | null | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const raw = (body as {analytics_client_id?: unknown}).analytics_client_id;
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || null;
}

const CHAT_SESSION_LINK_ID_RE = /^sess_[A-Za-z0-9-]{1,123}$/;

/**
 * Pixel `chat_session_linked`: zapisz `analytics_client_id` tylko gdy sesja istnieje
 * i `analytics_consent = 1`. Bez tworzenia sesji. Logi bez surowych id.
 */
export async function handleChatSessionLinkedFromPixel(
  env: Env,
  payload: unknown,
): Promise<'linked' | 'ignored'> {
  if (!payload || typeof payload !== 'object') return 'ignored';
  const data = (payload as {data?: unknown}).data;
  const rec =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : (payload as Record<string, unknown>);
  const chatSessionId =
    typeof rec.chat_session_id === 'string' ? rec.chat_session_id.trim() : '';
  const clientId = typeof rec.client_id === 'string' ? rec.client_id.trim() : '';
  if (!CHAT_SESSION_LINK_ID_RE.test(chatSessionId) || !clientId) {
    return 'ignored';
  }

  const known = await isBuyerChatSessionKnown(env, chatSessionId);
  if (!known) {
    console.log(
      JSON.stringify({
        tag: 'buyer.chat_session_linked',
        result: 'ignored_unknown',
        sid: chatSessionId.slice(0, 8),
      }),
    );
    return 'ignored';
  }

  let consent: number | null = null;
  if (env.DB_CHATBOT) {
    try {
      const row = await env.DB_CHATBOT
        .prepare(
          'SELECT analytics_consent FROM sessions WHERE session_id = ? LIMIT 1',
        )
        .bind(chatSessionId)
        .first<{analytics_consent: number | null}>();
      consent =
        typeof row?.analytics_consent === 'number' ? row.analytics_consent : null;
    } catch (error) {
      console.warn(
        JSON.stringify({
          tag: 'buyer.chat_session_linked.d1_failed',
          sid: chatSessionId.slice(0, 8),
          error: String((error as Error).message).slice(0, 120),
        }),
      );
      return 'ignored';
    }
  }
  if (consent !== 1) {
    console.log(
      JSON.stringify({
        tag: 'buyer.chat_session_linked',
        result: 'ignored_no_consent',
        sid: chatSessionId.slice(0, 8),
      }),
    );
    return 'ignored';
  }

  try {
    await postBuyerSessionPrivacy(env, chatSessionId, {
      analyticsConsent: 1,
      analyticsClientId: clientId,
    });
    console.log(
      JSON.stringify({
        tag: 'buyer.chat_session_linked',
        result: 'linked',
        sid: chatSessionId.slice(0, 8),
      }),
    );
    return 'linked';
  } catch (error) {
    console.warn(
      JSON.stringify({
        tag: 'buyer.chat_session_linked',
        result: 'error',
        sid: chatSessionId.slice(0, 8),
        error: String((error as Error).message).slice(0, 120),
      }),
    );
    return 'ignored';
  }
}

export function extractSessionIdFromPrivacyBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as {session_id?: unknown}).session_id;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

/**
 * App Proxy `/apps/assistant/session-privacy` lub S2S `/session-privacy` (Hydrogen BFF).
 * Tylko session_id + zgoda — bez treści czatu; nie tworzy nowej sesji.
 */
export async function handleBuyerSessionPrivacyRequest(
  request: Request,
  env: Env,
  responseHeaders: Record<string, string> = {},
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {status: 405, headers: responseHeaders});
  }

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return new Response('Bad Request: Content-Type application/json required', {
      status: 400,
      headers: responseHeaders,
    });
  }

  const raw = await request.json().catch(() => null);
  const sessionId = extractSessionIdFromPrivacyBody(raw);
  if (!sessionId) {
    return new Response('Bad Request: session_id required', {
      status: 400,
      headers: responseHeaders,
    });
  }

  if (!env.SESSION_DO) {
    return new Response('Service Unavailable', {status: 503, headers: responseHeaders});
  }

  const analyticsConsent = extractAnalyticsConsentFromBody(raw);
  const sessionIdSource = extractSessionIdSourceFromBody(raw);
  const analyticsClientId = extractAnalyticsClientIdFromBody(raw);
  if (
    analyticsConsent === undefined &&
    !sessionIdSource &&
    analyticsClientId === undefined
  ) {
    return new Response(null, {status: 204, headers: responseHeaders});
  }

  const known = await isBuyerChatSessionKnown(env, sessionId);
  if (!known) {
    return new Response(null, {status: 204, headers: responseHeaders});
  }

  try {
    await postBuyerSessionPrivacy(env, sessionId, {
      analyticsConsent,
      sessionIdSource,
      analyticsClientId:
        analyticsConsent === 0
          ? null
          : analyticsConsent === 1
            ? analyticsClientId
            : undefined,
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        tag: 'buyer.session_privacy',
        sid: sessionId.slice(0, 8),
        error: String((error as Error).message).slice(0, 120),
      }),
    );
    return new Response('Internal Server Error', {status: 500, headers: responseHeaders});
  }

  return new Response(null, {status: 204, headers: responseHeaders});
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
      await postBuyerSessionPrivacy(env, sid, {
        analyticsConsent: input.analyticsConsent,
        sessionIdSource: input.sessionIdSource,
        analyticsClientId: input.analyticsConsent === 0 ? null : undefined,
      });
    }
  } catch (e) {
    console.warn('[buyer.session_context] ensure failed', e);
  }
}
