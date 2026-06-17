/** Service Account → OAuth access token (Workers Web Crypto). */

function base64UrlEncode(data: string): string {
  const b64 = btoa(data);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function str2ab(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

export async function getAccessTokenFromServiceAccountJson(
  jsonStr: string,
  scope: string,
): Promise<string | null> {
  let creds: { client_email?: string; private_key?: string };
  try {
    creds = JSON.parse(jsonStr) as { client_email?: string; private_key?: string };
  } catch {
    return null;
  }
  const email = creds.client_email?.trim();
  const pem = creds.private_key?.replace(/\\n/g, '\n');
  if (!email || !pem) return null;

  try {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: email,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedClaim = base64UrlEncode(JSON.stringify(claim));
    const signatureInput = `${encodedHeader}.${encodedClaim}`;
    const key = await crypto.subtle.importKey(
      'pkcs8',
      str2ab(pem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(signatureInput),
    );
    const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
    const jwt = `${signatureInput}.${encodedSignature}`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });
    const tokenData = (await tokenResponse.json()) as { access_token?: string };
    return tokenData.access_token ?? null;
  } catch (e) {
    console.error('[MARKETING_INGEST] SA JWT error:', e instanceof Error ? e.message : String(e));
    return null;
  }
}
