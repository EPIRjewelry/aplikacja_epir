/**
 * BFF: przeglądarka → POST /api/chat (same origin) → S2S POST na worker `/chat`.
 * Wymaga sekretu `EPIR_CHAT_SHARED_SECRET` (Pages) = ten sam co na workerze `wrangler secret put EPIR_CHAT_SHARED_SECRET`.
 */
import {json, type ActionArgs, type LoaderArgs} from '@remix-run/cloudflare';
import {getEpirChatSharedSecret} from '~/lib/chat-proxy-secret';

const CHAT_S2S_URL = 'https://asystent.epirbizuteria.pl/chat';
const MISSING_SECRET_ERROR =
  'Chat proxy: brak EPIR_CHAT_SHARED_SECRET w Cloudflare Pages (Production env).';

function getEnvFromActionContext(context: ActionArgs['context']): Record<string, unknown> {
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

export async function loader({request}: LoaderArgs) {
  if (request.method !== 'GET') {
    return json({error: 'Method not allowed'}, {status: 405});
  }
  return json({ok: true, hint: 'POST JSON body to chat'});
}

export async function action({request, context}: ActionArgs) {
  if (request.method !== 'POST') {
    return json({error: 'Method not allowed'}, {status: 405});
  }

  const env = getEnvFromActionContext(context);
  const secret = getEpirChatSharedSecret(env);
  if (!secret) {
    const hasMainKey = Object.prototype.hasOwnProperty.call(env, 'EPIR_CHAT_SHARED_SECRET');
    const hasLegacyKey = Object.prototype.hasOwnProperty.call(env, 'CHAT_SHARED_SECRET');
    const hasHeaderNamedKey = Object.prototype.hasOwnProperty.call(env, 'X-EPIR-SHARED-SECRET');
    console.error('[api.chat] Missing shared secret in Pages runtime', {
      hasMainKey,
      hasLegacyKey,
      hasHeaderNamedKey,
      envKeysCount: Object.keys(env).length,
    });
    return json(
      {
        error: MISSING_SECRET_ERROR,
        hint:
          'Ustaw sekret EPIR_CHAT_SHARED_SECRET (albo X-EPIR-SHARED-SECRET) w Cloudflare Pages -> zareczyny-hydrogen-pages -> Variables and Secrets -> Production i Preview, a potem wykonaj redeploy.',
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
  if (!bodyText) {
    return json({error: 'Empty body'}, {status: 400});
  }

  let upstream: Response;
  try {
    upstream = await fetch(CHAT_S2S_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EPIR-SHARED-SECRET': secret,
        'X-EPIR-STOREFRONT-ID': 'zareczyny',
        'X-EPIR-CHANNEL': 'hydrogen-zareczyny',
      },
      body: bodyText,
    });
  } catch (err) {
    console.error('[api.chat] Upstream fetch failed', err);
    return json(
      {
        error:
          'Chat proxy: nie udało się połączyć z serwerem asystenta. Spróbuj ponownie za chwilę.',
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
