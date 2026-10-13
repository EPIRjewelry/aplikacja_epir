/**
 * BFF: przeglądarka → POST /api/chat-session-privacy → S2S POST na worker `/session-privacy`.
 */
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from '@remix-run/cloudflare';
import {getEpirChatSharedSecret} from '~/lib/chat-proxy-secret';
import {KAZKA_CHANNEL, KAZKA_STOREFRONT_ID} from '~/lib/chat-widget-context';

const SESSION_PRIVACY_S2S_URL = 'https://asystent.epirbizuteria.pl/session-privacy';
const MISSING_SECRET_ERROR =
  'Session privacy proxy: brak EPIR_CHAT_SHARED_SECRET w Cloudflare Pages (Production env).';

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

export async function loader({request}: LoaderFunctionArgs) {
  if (request.method !== 'GET') {
    return json({error: 'Method not allowed'}, {status: 405});
  }
  return json({ok: true, hint: 'POST JSON body with session_id and analytics_consent'});
}

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({error: 'Method not allowed'}, {status: 405});
  }

  const env = getEnvFromActionContext(context);
  const secret = getEpirChatSharedSecret(env);
  if (!secret) {
    return json({error: MISSING_SECRET_ERROR}, {status: 503});
  }

  const bodyText = await request.text();
  if (!bodyText) {
    return json({error: 'Empty body'}, {status: 400});
  }

  let upstream: Response;
  try {
    upstream = await fetch(SESSION_PRIVACY_S2S_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EPIR-SHARED-SECRET': secret,
        'X-EPIR-STOREFRONT-ID': KAZKA_STOREFRONT_ID,
        'X-EPIR-CHANNEL': KAZKA_CHANNEL,
      },
      body: bodyText,
    });
  } catch (err) {
    console.error('[api.chat-session-privacy] Upstream fetch failed', err);
    return json(
      {
        error:
          'Session privacy proxy: nie udało się połączyć z serwerem asystenta. Spróbuj ponownie za chwilę.',
      },
      {status: 502},
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}
