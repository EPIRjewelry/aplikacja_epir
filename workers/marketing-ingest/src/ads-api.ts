/**
 * Google Ads GAQL + mutate helpers (v25).
 * Reuses OAuth secrets już na workerze epir-marketing-ingest.
 */
import type { AdsEnv } from './ads';

const ADS_API = 'v25';

export type GaqlRow = Record<string, unknown>;

async function refreshAdsAccessToken(
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

export function adsCustomerId(env: AdsEnv): string {
  return (env.GOOGLE_ADS_CUSTOMER_ID ?? '').replace(/-/g, '').trim();
}

function adsHeaders(env: AdsEnv, access: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${access}`,
    'developer-token': (env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '').trim(),
    'Content-Type': 'application/json',
  };
  const loginCid = (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '').trim();
  if (loginCid) headers['login-customer-id'] = loginCid;
  return headers;
}

export async function adsSearch(
  env: AdsEnv,
  query: string,
): Promise<{ ok: true; results: GaqlRow[] } | { ok: false; error: string }> {
  const customerId = adsCustomerId(env);
  const devTok = (env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '').trim();
  if (!customerId || !devTok) {
    return { ok: false, error: 'missing GOOGLE_ADS_CUSTOMER_ID or GOOGLE_ADS_DEVELOPER_TOKEN' };
  }
  const accessRes = await refreshAdsAccessToken(env);
  if (!accessRes.ok) return { ok: false, error: accessRes.error };
  const access = accessRes.token;

  const url = `https://googleads.googleapis.com/${ADS_API}/customers/${customerId}/googleAds:search`;
  const results: GaqlRow[] = [];
  let pageToken: string | undefined;
  do {
    const res = await fetch(url, {
      method: 'POST',
      headers: adsHeaders(env, access),
      body: JSON.stringify({ query, pageToken }),
    });
    const text = await res.text();
  if (!res.ok) {
    const detail =
      text.trim() ||
      res.headers.get('grpc-message') ||
      res.headers.get('request-id') ||
      'empty body';
    return { ok: false, error: `HTTP ${res.status}: ${detail}` };
  }
    let data: { results?: GaqlRow[]; nextPageToken?: string };
    try {
      data = JSON.parse(text) as { results?: GaqlRow[]; nextPageToken?: string };
    } catch (e) {
      return { ok: false, error: `parse search: ${String(e)} body=${text.slice(0, 400)}` };
    }
    if (Array.isArray(data.results)) results.push(...data.results);
    pageToken = data.nextPageToken || undefined;
  } while (pageToken);

  return { ok: true, results };
}

export async function adsMutate(
  env: AdsEnv,
  pathSuffix: string,
  body: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const customerId = adsCustomerId(env);
  if (!customerId) return { ok: false, error: 'ads customer missing' };
  const accessRes = await refreshAdsAccessToken(env);
  if (!accessRes.ok) return { ok: false, error: accessRes.error };
  const access = accessRes.token;
  const url = `https://googleads.googleapis.com/${ADS_API}/customers/${customerId}/${pathSuffix}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: adsHeaders(env, access),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 1200)}` };
  }
  return { ok: true, data };
}
