import type { AdsEnv } from './ads';
import { fetchAdsMarketingRows } from './ads';
import type { Ga4Env } from './ga4';
import { fetchGa4MarketingRows, yesterdayUtcDate } from './ga4';

export type MarketingPreviewEnv = Ga4Env & AdsEnv & { MARKETING_OPS_PREVIEW_KEY?: string };

const PREVIEW_PATH = '/ops/marketing-preview';

export type MarketingPreviewBody = {
  date: string;
  google_ads: {
    rowCount: number;
    topCampaigns: Array<{
      campaign_id: string;
      campaign_name: string;
      impressions: number;
      clicks: number;
      cost: number;
      conversions: number;
    }>;
  };
  google_analytics: {
    rowCount: number;
    topRows: Array<{
      campaign_name: string;
      session_source: string;
      sessions: number;
      conversions: number;
      revenue: number;
    }>;
  };
};

/** Wspólna logika z GET /ops/marketing-preview — używana też przez Agents SDK (bez drugiego workera). */
export async function buildMarketingPreviewBody(env: MarketingPreviewEnv, date: string): Promise<MarketingPreviewBody> {
  const [adsRows, gaRows] = await Promise.all([
    fetchAdsMarketingRows(env, date),
    fetchGa4MarketingRows(env, date),
  ]);

  const adsSorted = [...adsRows].sort((a, b) => (b.metric_impressions ?? 0) - (a.metric_impressions ?? 0));
  const topAds = adsSorted.slice(0, 20).map((r) => ({
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    impressions: r.metric_impressions,
    clicks: r.metric_clicks,
    cost: r.metric_cost,
    conversions: r.metric_conversions,
  }));

  const topGa = gaRows.slice(0, 20).map((r) => ({
    campaign_name: r.campaign_name,
    session_source: r.session_source,
    sessions: r.metric_sessions,
    conversions: r.metric_conversions,
    revenue: r.metric_revenue,
  }));

  return {
    date,
    google_ads: { rowCount: adsRows.length, topCampaigns: topAds },
    google_analytics: { rowCount: gaRows.length, topRows: topGa },
  };
}

function parseIsoDate(s: string | null): string | null {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

/** GET z nagłówkiem Authorization: Bearer &lt;MARKETING_OPS_PREVIEW_KEY&gt;. Brak sekretu w env → 404 (ukryta ścieżka). */
export async function handleMarketingPreview(req: Request, env: MarketingPreviewEnv): Promise<Response | null> {
  const u = new URL(req.url);
  if (req.method !== 'GET' || u.pathname !== PREVIEW_PATH) return null;

  const configured = (env.MARKETING_OPS_PREVIEW_KEY ?? '').trim();
  if (!configured) return new Response('Not Found', { status: 404 });

  const auth = req.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+(\S+)/i.exec(auth);
  const token = m?.[1]?.trim() ?? '';
  if (token !== configured) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store' },
    });
  }

  const date = parseIsoDate(u.searchParams.get('date')) ?? yesterdayUtcDate();
  const body = await buildMarketingPreviewBody(env, date);

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
