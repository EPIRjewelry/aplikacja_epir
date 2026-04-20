/**
 * BFF: przeglądarka → POST /api/consent (same origin) → S2S POST na worker `/consent`.
 * Wymaga `EPIR_CHAT_SHARED_SECRET` w Cloudflare Pages (jak api.chat).
 */
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from '@remix-run/cloudflare';
import {getEpirChatSharedSecret} from '~/lib/chat-proxy-secret';
import {KAZKA_CHANNEL, KAZKA_STOREFRONT_ID} from '~/lib/chat-widget-context';

const CONSENT_S2S_URL = 'https://asystent.epirbizuteria.pl/consent';
const MISSING_SECRET_ERROR =
  'Consent proxy: brak EPIR_CHAT_SHARED_SECRET w Cloudflare Pages (Production env).';

function getEnvFromActionContext(
  context: ActionFunctionArgs['context'],
): Record<string, unknown> {
  const raw = context as unknown as Record<string, unknown> | undefined;
  const envDirect = raw?.env;
  if (envDirect && typeof envDirect === 'object') {
    return envDirect as Record<string, unknown>;
  }
  const cloudflare = raw?.cloudflare as Record<string, unknown> | undefined;
  const envNested = cloudflare?.env;
  if (envNested && typeof envNested === 'object') {
    return envNested as Record<string, unknown>;
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** Walidacja natywna — zgodna z workers/chat `parseConsentJsonBody` (S2S). */
function validateConsentBody(input: unknown): string | null {
  if (!isRecord(input)) return 'JSON object required';
  if (!trimString(input.consentId)) return 'consentId required';
  if (typeof input.granted !== 'boolean') return 'granted must be a boolean';
  if (!trimString(input.source)) return 'source required';
  if (!trimString(input.sessionId)) return 'sessionId required';
  if (typeof input.timestamp !== 'number' || !Number.isFinite(input.timestamp)) {
    return 'timestamp must be a finite number';
  }
  if (Math.trunc(input.timestamp) < 0) return 'timestamp must be non-negative';
  if (typeof input.storefrontId !== 'string' || !input.storefrontId.trim()) {
    return 'storefrontId required';
  }
  if (typeof input.channel !== 'string' || !input.channel.trim()) {
    return 'channel required';
  }
  if (typeof input.shopDomain !== 'string') return 'shopDomain required';
  if (typeof input.route !== 'string') return 'route required';
  if (typeof input.anonymousId !== 'string') return 'anonymousId required';
  if (input.customerId !== undefined && input.customerId !== null) {
    if (typeof input.customerId !== 'string') return 'customerId must be a string or null';
  }
  return null;
}

export async function loader(_args: LoaderFunctionArgs) {
  return json({error: 'Method not allowed'}, {status: 405});
}

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({error: 'Method not allowed'}, {status: 405});
  }

  const env = getEnvFromActionContext(context);
  const secret = getEpirChatSharedSecret(env);
  if (!secret) {
    const hasMainKey = Object.prototype.hasOwnProperty.call(
      env,
      'EPIR_CHAT_SHARED_SECRET',
    );
    const hasLegacyKey = Object.prototype.hasOwnProperty.call(
      env,
      'CHAT_SHARED_SECRET',
    );
    const hasHeaderNamedKey = Object.prototype.hasOwnProperty.call(
      env,
      'X-EPIR-SHARED-SECRET',
    );
    console.error('[api.consent] Missing shared secret in Pages runtime', {
      hasMainKey,
      hasLegacyKey,
      hasHeaderNamedKey,
      envKeysCount: Object.keys(env).length,
    });
    return json(
      {
        error: MISSING_SECRET_ERROR,
        hint:
          'Ustaw sekret EPIR_CHAT_SHARED_SECRET w Cloudflare Pages -> kazka-hydrogen-pages -> Variables and Secrets, potem redeploy.',
        debug: {
          hasEpirChatSharedSecretKey: hasMainKey,
          hasChatSharedSecretKey: hasLegacyKey,
          hasXEpirSharedSecretKey: hasHeaderNamedKey,
          envKeysCount: Object.keys(env).length,
        },
      },
      {status: 503},
    );
  }

  const bodyText = await request.text();
  if (!bodyText.trim()) {
    return json({error: 'Empty body'}, {status: 400});
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    return json({error: 'Invalid JSON'}, {status: 400});
  }

  const validationError = validateConsentBody(parsed);
  if (validationError) {
    return json({error: validationError}, {status: 400});
  }

  const normalized = parsed as Record<string, unknown>;
  const forwardBody = JSON.stringify({
    ...normalized,
    storefrontId: KAZKA_STOREFRONT_ID,
    channel: KAZKA_CHANNEL,
  });

  let upstream: Response;
  try {
    upstream = await fetch(CONSENT_S2S_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EPIR-SHARED-SECRET': secret,
        'X-EPIR-STOREFRONT-ID': KAZKA_STOREFRONT_ID,
        'X-EPIR-CHANNEL': KAZKA_CHANNEL,
      },
      body: forwardBody,
    });
  } catch (err) {
    console.error('[api.consent] Upstream fetch failed', err);
    return json(
      {
        error:
          'Consent proxy: nie udało się połączyć z serwerem asystenta. Spróbuj ponownie za chwilę.',
      },
      {status: 502},
    );
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    console.error('[api.consent] Upstream error', upstream.status, errText);
    return json(
      {error: errText || `Upstream HTTP ${upstream.status}`},
      {status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502},
    );
  }

  if (upstream.status === 204) {
    return new Response(null, {status: 204});
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {'Content-Type': upstream.headers.get('content-type') ?? 'application/json'},
  });
}
