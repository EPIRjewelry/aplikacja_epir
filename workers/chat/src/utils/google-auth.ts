/* Minimal Google Service Account JWT helper for Cloudflare Workers
   - Generates an OAuth2 access token for a given scope using the service account JSON
   - Caches token in-memory for the worker instance
   Minimal, self-contained: includes base64url and PEM -> ArrayBuffer helpers.
*/

export interface GoogleToken {
  access_token?: string;
  expires_at?: number; // epoch seconds
}

let cachedToken: GoogleToken | null = null;

function base64UrlEncode(input: string | Uint8Array): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = input;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\r|\n/g, '').trim();
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Obtain an access token from a service account JSON. Accepts either a parsed object or a JSON string.
 * scope defaults to BigQuery if not provided.
 */
export async function getAccessTokenFromServiceAccount(
  saJsonOrString: string | Record<string, any>,
  scope = 'https://www.googleapis.com/auth/bigquery'
): Promise<GoogleToken | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.access_token && cachedToken.expires_at && cachedToken.expires_at - 60 > nowSec) {
    return cachedToken;
  }

  let sa: any;
  if (typeof saJsonOrString === 'string') {
    // try parsing
    try {
      sa = JSON.parse(saJsonOrString);
    } catch (e) {
      // sometimes the JSON is stored with escaped newlines; try to fix and parse
      try {
        sa = JSON.parse(saJsonOrString.replace(/\\n/g, '\n'));
      } catch (e2) {
        console.error('[google-auth] invalid service account JSON');
        return null;
      }
    }
  } else {
    sa = saJsonOrString;
  }

  const clientEmail = sa?.client_email;
  const privateKey = sa?.private_key;
  if (!clientEmail || !privateKey) {
    console.error('[google-auth] service account missing client_email or private_key');
    return null;
  }

  const iat = nowSec;
  const exp = iat + 3600; // 1h

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp,
    iat
  };

  const jwtHeader = base64UrlEncode(JSON.stringify(header));
  const jwtClaim = base64UrlEncode(JSON.stringify(claim));
  const signingInput = `${jwtHeader}.${jwtClaim}`;

  let cryptoKey: CryptoKey;
  try {
    const pkcs8 = pemToArrayBuffer(privateKey);
    cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
  } catch (e) {
    console.error('[google-auth] importKey failed', e);
    return null;
  }

  let signature: ArrayBuffer;
  try {
    signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  } catch (e) {
    console.error('[google-auth] sign failed', e);
    return null;
  }

  const signatureB64Url = base64UrlEncode(new Uint8Array(signature));
  const jwt = `${signingInput}.${signatureB64Url}`;

  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '<no body>');
      console.error('[google-auth] token endpoint error', resp.status, txt);
      return null;
    }
    const data = (await resp.json()) as { access_token?: string; expires_in?: number };
    if (!data?.access_token) return null;
    const expires_at = Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600);
    cachedToken = { access_token: data.access_token, expires_at };
    return cachedToken;
  } catch (e) {
    console.error('[google-auth] token request failed', e);
    return null;
  }
}

export function clearAccessTokenCache(): void {
  cachedToken = null;
}
