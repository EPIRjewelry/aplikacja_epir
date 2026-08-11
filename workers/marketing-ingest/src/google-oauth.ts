/**
 * OAuth refresh — wspólny dla Google Ads API i Data Manager API.
 */
import type { AdsEnv } from './ads';

export async function refreshGoogleAccessToken(
  env: AdsEnv,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const cid = (env.GOOGLE_ADS_CLIENT_ID ?? '').trim();
  const sec = (env.GOOGLE_ADS_CLIENT_SECRET ?? '').trim();
  const rt = (env.GOOGLE_ADS_REFRESH_TOKEN ?? '').trim();
  if (!cid || !sec || !rt) {
    return {
      ok: false,
      error: `missing oauth pieces clientId=${Boolean(cid)} secret=${Boolean(sec)} refresh=${Boolean(rt)}`,
    };
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cid,
      client_secret: sec,
      refresh_token: rt,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    return {
      ok: false,
      error: `token HTTP ${res.status}: ${data.error ?? ''} ${data.error_description ?? ''}`.trim(),
    };
  }
  return { ok: true, token: data.access_token };
}
