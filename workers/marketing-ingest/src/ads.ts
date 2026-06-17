import type { MarketingStreamRecord } from './schema';

export interface AdsEnv {
  GOOGLE_ADS_CLIENT_ID?: string;
  GOOGLE_ADS_CLIENT_SECRET?: string;
  GOOGLE_ADS_REFRESH_TOKEN?: string;
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;
  /** Bez myślników */
  GOOGLE_ADS_CUSTOMER_ID?: string;
  /** Opcjonalnie: CID konta menedżerskiego (MCC), bez myślników — nagłówek login-customer-id przy zapytaniach do konta klienckiego. */
  GOOGLE_ADS_LOGIN_CUSTOMER_ID?: string;
}

async function refreshAdsAccessToken(env: AdsEnv): Promise<string | null> {
  const cid = (env.GOOGLE_ADS_CLIENT_ID ?? '').trim();
  const sec = (env.GOOGLE_ADS_CLIENT_SECRET ?? '').trim();
  const rt = (env.GOOGLE_ADS_REFRESH_TOKEN ?? '').trim();
  if (!cid || !sec || !rt) return null;
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
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    console.error('[MARKETING_INGEST] Ads token refresh failed', res.status, data.error ?? '');
    return null;
  }
  return data.access_token;
}

export async function fetchAdsMarketingRows(env: AdsEnv, date: string): Promise<MarketingStreamRecord[]> {
  const customerId = (env.GOOGLE_ADS_CUSTOMER_ID ?? '').replace(/-/g, '').trim();
  const devTok = (env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '').trim();
  if (!customerId || !devTok) {
    console.warn('[MARKETING_INGEST] Ads skip: missing GOOGLE_ADS_CUSTOMER_ID or GOOGLE_ADS_DEVELOPER_TOKEN');
    return [];
  }

  const access = await refreshAdsAccessToken(env);
  if (!access) {
    console.error('[MARKETING_INGEST] Ads skip: access-token refresh failed');
    return [];
  }

  const query = `
    SELECT campaign.id, campaign.name, segments.date,
      metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM campaign
    WHERE segments.date = '${date}'
    LIMIT 10000
  `.trim();

  const loginCid = (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '').trim();

  const url = `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${access}`,
    'developer-token': devTok,
    'Content-Type': 'application/json',
  };
  if (loginCid) headers['login-customer-id'] = loginCid;

  console.log('[MARKETING_INGEST] Ads GAQL request', { date, customerId, loginCustomerId: loginCid || null });

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('[MARKETING_INGEST] Ads search HTTP', { status: res.status, body: errText.slice(0, 500) });
    return [];
  }
  const data = (await res.json()) as {
    results?: Array<{
      campaign?: { id?: string; name?: string };
      segments?: { date?: string };
      metrics?: {
        impressions?: string | number;
        clicks?: string | number;
        costMicros?: string | number;
        conversions?: string | number;
      };
    }>;
  };
  const results = data.results ?? [];
  console.log('[MARKETING_INGEST] Ads GAQL response', { date, resultsCount: results.length });
  const out: MarketingStreamRecord[] = [];
  for (const row of results) {
    const cidStr = row.campaign?.id != null ? String(row.campaign.id) : null;
    const name = row.campaign?.name ?? null;
    const d = row.segments?.date ?? date;
    const impressions = Number(row.metrics?.impressions ?? 0) || 0;
    const clicks = Number(row.metrics?.clicks ?? 0) || 0;
    const costMicros = Number(row.metrics?.costMicros ?? 0) || 0;
    const conv = Number(row.metrics?.conversions ?? 0) || 0;
    out.push({
      source: 'google_ads',
      date: d,
      campaign_id: cidStr,
      campaign_name: name,
      session_source: null,
      metric_sessions: null,
      metric_conversions: conv,
      metric_revenue: null,
      metric_impressions: impressions,
      metric_clicks: clicks,
      metric_cost: costMicros / 1_000_000,
    });
  }
  return out;
}
