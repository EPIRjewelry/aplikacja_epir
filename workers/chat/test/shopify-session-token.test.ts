import { describe, expect, it } from 'vitest';
import { verifyShopifySessionTokenJwt, parseAuthorizationBearer } from '../src/shopify-session-token';
import type { Env } from '../src/config/bindings';

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeJson(obj: unknown): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(obj)));
}

async function signShopifyLikeSessionJwt(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = base64UrlEncodeJson(header);
  const p = base64UrlEncodeJson(payload);
  const data = new TextEncoder().encode(`${h}.${p}`);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, data);
  const s = base64UrlEncodeBytes(new Uint8Array(sigBuf));
  return `${h}.${p}.${s}`;
}

describe('shopify-session-token', () => {
  const secret = 'test-secret-at-least-32-bytes-long!!!';
  const clientId = 'test-client-id-from-partners';
  const env: Pick<Env, 'SHOPIFY_APP_SECRET' | 'SHOPIFY_CLIENT_ID' | 'SHOP_DOMAIN'> = {
    SHOPIFY_APP_SECRET: secret,
    SHOPIFY_CLIENT_ID: clientId,
    SHOP_DOMAIN: 'epir-test.myshopify.com',
  };

  it('parses Bearer header', () => {
    const r = new Request('https://x/chat', {
      headers: { Authorization: 'Bearer abc.def.ghi' },
    });
    expect(parseAuthorizationBearer(r)).toBe('abc.def.ghi');
    expect(parseAuthorizationBearer(new Request('https://x'))).toBeNull();
  });

  it('verifies HS256 token and extracts Customer gid from sub', async () => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = await signShopifyLikeSessionJwt(
      {
        dest: 'https://epir-test.myshopify.com',
        aud: clientId,
        sub: 'gid://shopify/Customer/7012345678901',
        exp: now + 120,
        nbf: now - 10,
        iat: now,
      },
      secret,
    );

    const out = await verifyShopifySessionTokenJwt(jwt, env, {
      shopFromQuery: 'epir-test.myshopify.com',
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.customerGid).toBe('gid://shopify/Customer/7012345678901');
    }
  });

  it('rejects wrong signature', async () => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = await signShopifyLikeSessionJwt(
      {
        dest: 'https://epir-test.myshopify.com',
        aud: clientId,
        sub: 'gid://shopify/Customer/1',
        exp: now + 120,
        nbf: now - 10,
      },
      'wrong-secret',
    );

    const out = await verifyShopifySessionTokenJwt(jwt, env, {
      shopFromQuery: 'epir-test.myshopify.com',
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('signature_invalid');
  });
});
