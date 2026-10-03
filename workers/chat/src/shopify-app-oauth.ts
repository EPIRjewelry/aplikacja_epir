/**
 * Shopify OAuth callback for epir_ai (`GET /api/auth`).
 * After the shop grant, ensures the app web pixel record exists.
 * A missing pixel is created. An existing one is updated. The Customer Events paste is left alone.
 * The Admin access token is never written to the response or to logs.
 */

import { verifyHmac } from './hmac';
import { SHOPIFY_ADMIN_API_VERSION } from './config/shopify-api-version';
import { reconcileEpirWebPixel } from '../../../scripts/shopify/epir-web-pixel-record.mjs';

const EPIR_AI_OAUTH_SCOPES =
  'customer_read_customers,customer_read_orders,customer_read_store_credit_accounts,unauthenticated_read_product_listings,read_reports,read_metaobjects,write_metaobjects,write_pixels,read_customer_events';
const EPIR_AI_CLIENT_ID = '80a9878cfb29c901c987bf0046a36238';

export type ShopifyAppOAuthEnv = {
  SHOPIFY_APP_SECRET?: string;
  SHOPIFY_CLIENT_ID?: string;
  SHOP_DOMAIN?: string;
};

type AdminGraphqlResult = {
  data?: {
    webPixel?: { id?: string; settings?: string } | null;
    webPixelCreate?: {
      userErrors?: Array<{ message?: string }>;
      webPixel?: { id?: string } | null;
    };
    webPixelUpdate?: {
      userErrors?: Array<{ message?: string }>;
      webPixel?: { id?: string } | null;
    };
  };
  errors?: Array<{ message?: string }>;
};

function normalizeShopHost(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
}

function isValidShopHost(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}

function buildOAuthRedirectUri(requestUrl: URL): string {
  return `${requestUrl.origin}/api/auth`;
}

async function verifyShopifyOAuthCallbackHmac(query: URLSearchParams, secret: string): Promise<boolean> {
  const hmac = query.get('hmac');
  if (!hmac?.trim()) return false;
  const pairs: string[] = [];
  for (const [key, value] of query.entries()) {
    if (key === 'hmac' || key === 'signature') continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  return verifyHmac(hmac, secret, pairs.join('&'));
}

async function exchangeOAuthCodeForToken(
  shop: string,
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string } | { error: string }> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  } | null;
  if (!res.ok || !json?.access_token) {
    const msg = json?.error_description || json?.error || `HTTP ${res.status}`;
    return { error: msg };
  }
  return { accessToken: json.access_token };
}

async function adminGraphql(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<AdminGraphqlResult> {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json().catch(() => null)) as AdminGraphqlResult | null;
  if (!res.ok) {
    return { errors: [{ message: `HTTP ${res.status}` }] };
  }
  if (!json || typeof json !== 'object') {
    return { errors: [{ message: 'Admin API response was not JSON' }] };
  }
  return json;
}

export async function ensureEpirWebPixelOnShop(shop: string, accessToken: string) {
  return reconcileEpirWebPixel((query, variables) => adminGraphql(shop, accessToken, query, variables));
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function handleShopifyAppOAuth(request: Request, env: ShopifyAppOAuthEnv): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }
  const appSecret = env.SHOPIFY_APP_SECRET?.trim();
  const clientId = (env.SHOPIFY_CLIENT_ID?.trim() || EPIR_AI_CLIENT_ID).trim();
  const shopDomain = normalizeShopHost(env.SHOP_DOMAIN?.trim() || '');
  if (!appSecret) {
    return jsonResponse({ error: 'shopify_app_secret_not_configured' }, 503);
  }
  const shopParam = url.searchParams.get('shop');
  const code = url.searchParams.get('code');
  if (code && shopParam) {
    const shop = normalizeShopHost(shopParam);
    if (!isValidShopHost(shop)) {
      return jsonResponse({ error: 'invalid_shop' }, 400);
    }
    if (shopDomain && shop !== shopDomain) {
      return jsonResponse({ error: 'shop_mismatch' }, 403);
    }
    const hmacOk = await verifyShopifyOAuthCallbackHmac(url.searchParams, appSecret);
    if (!hmacOk) {
      return jsonResponse({ error: 'invalid_hmac' }, 401);
    }
    const exchanged = await exchangeOAuthCodeForToken(shop, code, clientId, appSecret);
    if ('error' in exchanged) {
      return htmlResponse(`<p>OAuth failed: ${exchanged.error}</p>`, 502);
    }
    const pixel = await ensureEpirWebPixelOnShop(shop, exchanged.accessToken);
    if (!pixel.ok) {
      return htmlResponse(`<p>Token OK, web pixel failed: ${pixel.error}</p>`, 502);
    }
    return htmlResponse(
      `<!DOCTYPE html><html><body><h1>epir_ai OK</h1><p>Scopes granted. Web pixel: ${pixel.action}${pixel.id ? ` (${pixel.id})` : ''}.</p><p>Verify a storefront visit. The Customer Events paste stays connected.</p></body></html>`,
    );
  }
  const shop = normalizeShopHost(shopParam || shopDomain || '');
  if (!isValidShopHost(shop)) {
    return jsonResponse({ error: 'invalid_shop' }, 400);
  }
  const redirectUri = buildOAuthRedirectUri(url);
  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('scope', EPIR_AI_OAUTH_SCOPES);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('state', 'epir_pixel_enable');
  return Response.redirect(authorize.toString(), 302);
}
