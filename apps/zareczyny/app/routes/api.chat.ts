/**
 * BFF: przeglądarka → POST /api/chat (same origin) → S2S POST na worker `/chat`.
 * Wymaga sekretu `EPIR_CHAT_SHARED_SECRET` (Pages) = ten sam co na workerze `wrangler secret put EPIR_CHAT_SHARED_SECRET`.
 */
import {json, type ActionArgs, type LoaderArgs} from '@remix-run/cloudflare';

const CHAT_S2S_URL = 'https://asystent.epirbizuteria.pl/chat';

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

  const secret = context.env.EPIR_CHAT_SHARED_SECRET?.trim();
  if (!secret) {
    return json(
      {
        error:
          'Chat proxy: brak EPIR_CHAT_SHARED_SECRET w Cloudflare Pages (ten sam sekret co na workerze czatu).',
      },
      {status: 503},
    );
  }

  const bodyText = await request.text();
  if (!bodyText) {
    return json({error: 'Empty body'}, {status: 400});
  }

  const upstream = await fetch(CHAT_S2S_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-EPIR-SHARED-SECRET': secret,
      'X-EPIR-STOREFRONT-ID': 'zareczyny',
      'X-EPIR-CHANNEL': 'hydrogen-zareczyny',
    },
    body: bodyText,
  });

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
