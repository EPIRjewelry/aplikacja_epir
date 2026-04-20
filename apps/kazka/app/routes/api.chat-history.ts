/**
 * BFF: przeglądarka → POST /api/chat-history (same origin) → S2S POST na worker `/history`.
 * Wymaga sekretu `EPIR_CHAT_SHARED_SECRET` w Cloudflare Pages.
 */
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from '@remix-run/cloudflare';
import {getEpirChatSharedSecret} from '~/lib/chat-proxy-secret';
import {KAZKA_CHANNEL, KAZKA_STOREFRONT_ID} from '~/lib/chat-widget-context';

const HISTORY_S2S_URL = 'https://asystent.epirbizuteria.pl/history';
const MISSING_SECRET_ERROR =
  'History proxy: brak EPIR_CHAT_SHARED_SECRET w Cloudflare Pages (Production env).';

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

function parseHistoryBody(bodyText: string): {session_id: string} | null {
  try {
    const parsed = JSON.parse(bodyText) as {session_id?: unknown};
    const sessionId =
      typeof parsed?.session_id === 'string' ? parsed.session_id.trim() : '';
    if (!sessionId) return null;
    return {session_id: sessionId};
  } catch {
    return null;
  }
}

export async function loader({request}: LoaderFunctionArgs) {
  if (request.method !== 'GET') {
    return json({error: 'Method not allowed'}, {status: 405});
  }
  return json({ok: true, hint: 'POST JSON body with session_id to chat-history'});
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

  const payload = parseHistoryBody(bodyText);
  if (!payload) {
    return json({error: 'session_id required'}, {status: 400});
  }

  let upstream: Response;
  try {
    upstream = await fetch(HISTORY_S2S_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EPIR-SHARED-SECRET': secret,
        'X-EPIR-STOREFRONT-ID': KAZKA_STOREFRONT_ID,
        'X-EPIR-CHANNEL': KAZKA_CHANNEL,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[api.chat-history] Upstream fetch failed', err);
    return json(
      {
        error:
          'History proxy: nie udało się połączyć z serwerem asystenta. Spróbuj ponownie za chwilę.',
      },
      {status: 502},
    );
  }

  const outHeaders = new Headers();
  const ct = upstream.headers.get('content-type');
  if (ct) outHeaders.set('content-type', ct);
  const cc = upstream.headers.get('cache-control');
  if (cc) outHeaders.set('cache-control', cc);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}
