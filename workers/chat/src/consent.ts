import type { Env } from './config/bindings';

const EPIR_SHARED_SECRET_HEADER = 'X-EPIR-SHARED-SECRET';
const EPIR_STOREFRONT_HEADER = 'X-EPIR-STOREFRONT-ID';
const EPIR_CHANNEL_HEADER = 'X-EPIR-CHANNEL';

/** Zgodne z APP_PROXY_CHAT_CONTEXT_OVERRIDE w index.ts (buyer-facing). */
const APP_PROXY_CONSENT_STOREFRONT_ID = 'online-store';
const APP_PROXY_CONSENT_CHANNEL = 'online-store';

export type ConsentNormalizedRow = {
  consentId: string;
  granted: boolean;
  source: string;
  storefrontId: string;
  channel: string;
  shopDomain: string | null;
  route: string | null;
  sessionId: string;
  anonymousId: string | null;
  customerId: string | null;
  eventTimestamp: number;
};

function consentCors(env: Env, request?: Request): Record<string, string> {
  const requestOrigin = request?.headers.get('Origin');

  const allowedOrigins = (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  let allowOrigin = '*';

  if (requestOrigin && allowedOrigins.length > 0) {
    if (allowedOrigins.includes(requestOrigin)) {
      allowOrigin = requestOrigin;
    } else if (requestOrigin === 'null' && allowedOrigins.includes('null')) {
      allowOrigin = 'null';
    } else {
      console.warn(`[consent] Rejected Origin (not whitelisted): ${requestOrigin}`);
    }
  } else if (!requestOrigin && allowedOrigins.length === 1 && allowedOrigins[0] !== '*') {
    allowOrigin = allowedOrigins[0];
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': [
      'Content-Type',
      'Authorization',
      'X-Shop-Signature',
      'X-Shopify-Hmac-Sha256',
      'X-Brand',
      EPIR_SHARED_SECRET_HEADER,
      EPIR_STOREFRONT_HEADER,
      EPIR_CHANNEL_HEADER,
    ].join(','),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function optionalTrimmedString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Walidacja natywna (bez Zod). Wymagane pola logiczne: consentId, granted, source, sessionId, timestamp.
 * storefrontId + channel w trybie S2S dołączane z nagłówków w wywołującym kodzie.
 */
export function parseConsentJsonBody(
  raw: unknown,
  mode: 'app-proxy' | 's2s',
  url: URL,
  env: Env,
  s2s?: { storefrontId: string; channel: string },
):
  | { ok: true; row: ConsentNormalizedRow }
  | { ok: false; message: string } {
  if (!isRecord(raw)) {
    return { ok: false, message: 'Bad Request: JSON object required' };
  }

  const consentId = trimString(raw.consentId);
  if (!consentId) {
    return { ok: false, message: 'Bad Request: consentId required' };
  }

  if (typeof raw.granted !== 'boolean') {
    return { ok: false, message: 'Bad Request: granted must be a boolean' };
  }
  const granted = raw.granted;

  const source = trimString(raw.source);
  if (!source) {
    return { ok: false, message: 'Bad Request: source required' };
  }

  const sessionId = trimString(raw.sessionId);
  if (!sessionId) {
    return { ok: false, message: 'Bad Request: sessionId required' };
  }

  if (typeof raw.timestamp !== 'number' || !Number.isFinite(raw.timestamp)) {
    return { ok: false, message: 'Bad Request: timestamp must be a finite number' };
  }
  const eventTimestamp = Math.trunc(raw.timestamp);
  if (eventTimestamp < 0) {
    return { ok: false, message: 'Bad Request: timestamp must be non-negative' };
  }

  let storefrontId: string;
  let channel: string;
  if (mode === 'app-proxy') {
    storefrontId = APP_PROXY_CONSENT_STOREFRONT_ID;
    channel = APP_PROXY_CONSENT_CHANNEL;
  } else {
    if (!s2s) {
      return { ok: false, message: 'Bad Request: internal S2S context missing' };
    }
    storefrontId = s2s.storefrontId;
    channel = s2s.channel;
  }

  const shopFromQuery = optionalTrimmedString(url.searchParams.get('shop'));
  const shopFromBody = optionalTrimmedString(raw.shopDomain);
  const shopDomain = shopFromQuery ?? optionalTrimmedString(env.SHOP_DOMAIN) ?? shopFromBody;

  const route = optionalTrimmedString(raw.route);

  const anonymousRaw = raw.anonymousId;
  let anonymousId: string | null = null;
  if (anonymousRaw !== undefined && anonymousRaw !== null) {
    if (typeof anonymousRaw !== 'string') {
      return { ok: false, message: 'Bad Request: anonymousId must be a string when provided' };
    }
    const a = anonymousRaw.trim();
    anonymousId = a.length > 0 ? a : null;
  }

  const customerFromQuery = optionalTrimmedString(url.searchParams.get('logged_in_customer_id'));
  const customerFromBody = raw.customerId;
  let customerId = customerFromQuery;
  if (!customerId && customerFromBody !== undefined && customerFromBody !== null) {
    if (typeof customerFromBody !== 'string') {
      return { ok: false, message: 'Bad Request: customerId must be a string when provided' };
    }
    const c = customerFromBody.trim();
    customerId = c.length > 0 ? c : null;
  }

  return {
    ok: true,
    row: {
      consentId,
      granted,
      source,
      storefrontId,
      channel,
      shopDomain,
      route,
      sessionId,
      anonymousId,
      customerId,
      eventTimestamp,
    },
  };
}

async function readJsonBody(request: Request): Promise<unknown | null> {
  const text = await request.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function insertConsentEvent(env: Env, row: ConsentNormalizedRow, createdAt: number): Promise<void> {
  const db = env.DB_CHATBOT;
  if (!db) throw new Error('DB_CHATBOT not configured');
  await db
    .prepare(
      `INSERT INTO consent_events (
        consent_id, granted, source, storefront_id, channel, shop_domain, route,
        session_id, anonymous_id, customer_id, event_timestamp, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.consentId,
      row.granted ? 1 : 0,
      row.source,
      row.storefrontId,
      row.channel,
      row.shopDomain,
      row.route,
      row.sessionId,
      row.anonymousId,
      row.customerId,
      row.eventTimestamp,
      createdAt,
    )
    .run();
}

export async function handleConsentAppProxy(request: Request, env: Env): Promise<Response> {
  if (!env.DB_CHATBOT) {
    return new Response('Server misconfigured', {
      status: 500,
      headers: consentCors(env, request),
    });
  }

  const url = new URL(request.url);
  const raw = await readJsonBody(request);
  if (raw === null) {
    return new Response('Bad Request: invalid or empty JSON', {
      status: 400,
      headers: consentCors(env, request),
    });
  }

  const parsed = parseConsentJsonBody(raw, 'app-proxy', url, env);
  if (!parsed.ok) {
    return new Response(parsed.message, { status: 400, headers: consentCors(env, request) });
  }

  const createdAt = Date.now();
  try {
    await insertConsentEvent(env, parsed.row, createdAt);
  } catch (e) {
    console.error('[consent] insert failed:', e);
    return new Response('Internal Server Error', { status: 500, headers: consentCors(env, request) });
  }

  return new Response(null, { status: 204, headers: consentCors(env, request) });
}

export async function handleConsentS2S(
  request: Request,
  env: Env,
  contextOverride: { storefrontId: string; channel: string },
): Promise<Response> {
  if (!env.DB_CHATBOT) {
    return new Response('Server misconfigured', {
      status: 500,
      headers: consentCors(env, request),
    });
  }

  const url = new URL(request.url);
  const raw = await readJsonBody(request);
  if (raw === null) {
    return new Response('Bad Request: invalid or empty JSON', {
      status: 400,
      headers: consentCors(env, request),
    });
  }

  const parsed = parseConsentJsonBody(raw, 's2s', url, env, {
    storefrontId: contextOverride.storefrontId,
    channel: contextOverride.channel,
  });
  if (!parsed.ok) {
    return new Response(parsed.message, { status: 400, headers: consentCors(env, request) });
  }

  const createdAt = Date.now();
  try {
    await insertConsentEvent(env, parsed.row, createdAt);
  } catch (e) {
    console.error('[consent] insert failed:', e);
    return new Response('Internal Server Error', { status: 500, headers: consentCors(env, request) });
  }

  return new Response(null, { status: 204, headers: consentCors(env, request) });
}
