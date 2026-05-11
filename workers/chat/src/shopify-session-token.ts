/**
 * Weryfikacja Shopify Session Token (JWT / HS256), np. z Customer Account UI Extensions
 * lub kontekstu udostępniającego `shopify.sessionToken.get()` — patrz:
 * https://shopify.dev/docs/api/customer-account-ui-extensions/apis/session-token
 *
 * Token jest podpisany sekretem aplikacji (SHOPIFY_APP_SECRET). Opcjonalnie walidujemy
 * `aud` (Client ID aplikacji) i `dest` (domena sklepu .myshopify.com).
 */
import type { Env } from './config/bindings';

export type VerifiedShopifySessionToken = {
  /** gid://shopify/Customer/... gdy klient zalogowany i `sub` obecny */
  customerGid: string | null;
  payload: Record<string, unknown>;
};

function base64UrlToBytes(b64: string): Uint8Array {
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const s = (b64.replace(/-/g, '+').replace(/_/g, '/') + pad).trim();
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
  return x === 0;
}

function normalizeShopHost(host: string | null | undefined): string | null {
  const t = String(host ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
    .toLowerCase();
  return t.length > 0 ? t : null;
}

/**
 * Weryfikuje Bearer JWT (Shopify session token). Zwraca customer GID z `sub` lub null.
 */
export async function verifyShopifySessionTokenJwt(
  jwt: string,
  env: Pick<Env, 'SHOPIFY_APP_SECRET' | 'SHOPIFY_CLIENT_ID' | 'SHOP_DOMAIN'>,
  opts: { shopFromQuery: string | null },
): Promise<{ ok: true; result: VerifiedShopifySessionToken } | { ok: false; reason: string }> {
  const secret = env.SHOPIFY_APP_SECRET?.trim();
  if (!secret) return { ok: false, reason: 'missing_SHOPIFY_APP_SECRET' };

  const parts = jwt.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'invalid_jwt_segments' };

  const [h64, p64, s64] = parts;
  const encoder = new TextEncoder();
  const data = encoder.encode(`${h64}.${p64}`);

  let headerJson: unknown;
  let payloadJson: unknown;
  try {
    headerJson = JSON.parse(new TextDecoder().decode(base64UrlToBytes(h64)));
    payloadJson = JSON.parse(new TextDecoder().decode(base64UrlToBytes(p64)));
  } catch {
    return { ok: false, reason: 'invalid_jwt_encoding' };
  }

  const header = headerJson as { alg?: string; typ?: string };
  if (header.alg !== 'HS256') return { ok: false, reason: 'unexpected_alg' };

  const payload = payloadJson as Record<string, unknown>;
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  const nbf = typeof payload.nbf === 'number' ? payload.nbf : null;
  if (exp !== null && nowSec > exp + 60) return { ok: false, reason: 'token_expired' };
  if (nbf !== null && nowSec + 60 < nbf) return { ok: false, reason: 'token_not_yet_valid' };

  const aud = typeof payload.aud === 'string' ? payload.aud.trim() : '';
  const clientId = env.SHOPIFY_CLIENT_ID?.trim();
  if (clientId && aud && aud !== clientId) return { ok: false, reason: 'aud_mismatch' };

  const destRaw = typeof payload.dest === 'string' ? payload.dest.trim() : '';
  const destHost = normalizeShopHost(destRaw);
  const shopCandidate = normalizeShopHost(opts.shopFromQuery) ?? normalizeShopHost(env.SHOP_DOMAIN);
  if (destHost && shopCandidate && destHost !== shopCandidate) {
    return { ok: false, reason: 'dest_shop_mismatch' };
  }

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, data);
  const expected = new Uint8Array(sigBuf);
  let actual: Uint8Array;
  try {
    actual = base64UrlToBytes(s64);
  } catch {
    return { ok: false, reason: 'invalid_signature_encoding' };
  }
  if (!timingSafeEqual(expected, actual)) return { ok: false, reason: 'signature_invalid' };

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  let customerGid: string | null = null;
  if (/^gid:\/\/shopify\/Customer\/\d+$/i.test(sub)) {
    customerGid = sub;
  }

  return {
    ok: true,
    result: {
      customerGid,
      payload,
    },
  };
}

/** Odczytuje `Authorization: Bearer …` (tylko pierwszy Bearer). */
export function parseAuthorizationBearer(request: Request): string | null {
  const raw = request.headers.get('Authorization') ?? request.headers.get('authorization');
  if (!raw) return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  const tok = m?.[1]?.trim();
  return tok && tok.length > 0 ? tok : null;
}
