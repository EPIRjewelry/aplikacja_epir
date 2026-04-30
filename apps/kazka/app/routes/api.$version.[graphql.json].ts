import type {ActionFunctionArgs, LoaderFunctionArgs} from '@remix-run/cloudflare';

/** Nagłówki żądania zgłaszane w preflight (Access-Control-Request-Headers) — Hydrogen / Customer Privacy / SFAPI. */
const STOREFRONT_GRAPHQL_CORS_ALLOW_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'origin',
  'referer',
  'x-shopify-storefront-access-token',
  'x-shopify-storefront-private-token',
  'x-shopify-storefront-buyer-ip',
  'shopify-storefront-id',
  'shopify-storefront-y',
  'shopify-storefront-s',
  'x-shopify-visittoken',
  'x-shopify-uniquetoken',
  'x-sdk-variant',
  'x-sdk-variant-source',
  'x-sdk-version',
  'authorization',
  'purpose',
].join(', ');

function storefrontGraphqlCorsHeaders(request: Request): Headers {
  const h = new Headers();
  const origin = request.headers.get('Origin');
  if (origin) {
    h.set('Access-Control-Allow-Origin', origin);
    h.append('Vary', 'Origin');
  } else {
    h.set('Access-Control-Allow-Origin', '*');
  }
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  const requested = request.headers.get('Access-Control-Request-Headers')?.trim();
  h.set(
    'Access-Control-Allow-Headers',
    requested || STOREFRONT_GRAPHQL_CORS_ALLOW_HEADERS,
  );
  h.set('Access-Control-Max-Age', '86400');
  return h;
}

function withStorefrontGraphqlCors(request: Request, response: Response): Response {
  const origin = request.headers.get('Origin');
  if (!origin) return response;
  const headers = new Headers(response.headers);
  if (!headers.has('Access-Control-Allow-Origin')) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.append('Vary', 'Origin');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function sanitizedUpstreamHeaders(upstream: Headers): Headers {
  const out = new Headers();
  upstream.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === 'transfer-encoding' || k === 'connection') return;
    out.append(key, value);
  });
  return out;
}

/**
 * BFF dla Storefront API: `POST /api/{version}/graphql.json` → Shopify.
 * Umożliwia `sameDomainForStorefrontApi: true` w Hydrogen (bez CORS do myshopify.com).
 */
export async function action({request, context, params}: ActionFunctionArgs) {
  const version = params.version?.trim();
  if (!version) {
    return withStorefrontGraphqlCors(
      request,
      new Response(JSON.stringify({errors: [{message: 'Missing API version'}]}), {
        status: 400,
        headers: {'Content-Type': 'application/json'},
      }),
    );
  }

  const body = await request.arrayBuffer();

  try {
    const apiUrl = context.storefront.getApiUrl({storefrontApiVersion: version});
    const hdrs = context.storefront.getPrivateTokenHeaders({contentType: 'json'});
    const upstream = await fetch(apiUrl, {
      method: 'POST',
      headers: hdrs as HeadersInit,
      body,
    });

    return withStorefrontGraphqlCors(
      request,
      new Response(upstream.body, {
        status: upstream.status,
        headers: sanitizedUpstreamHeaders(upstream.headers),
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console -- diagnostyka dev / proxy SFAPI
    console.error('[kazka] storefront proxy:', err);
    return withStorefrontGraphqlCors(
      request,
      new Response(
        JSON.stringify({
          errors: [{message: 'Storefront proxy could not reach Shopify (network or env).'}],
        }),
        {status: 502, headers: {'Content-Type': 'application/json'}},
      ),
    );
  }
}

export async function loader({request}: LoaderFunctionArgs) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {status: 200, headers: storefrontGraphqlCorsHeaders(request)});
  }
  return new Response(null, {status: 405, headers: storefrontGraphqlCorsHeaders(request)});
}
