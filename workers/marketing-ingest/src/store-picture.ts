/**
 * Read-only store traffic + sales picture: GA4 runReport bundles + Ads GAQL for a date window.
 * GET /ops/store-picture?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
import type { AdsEnv } from './ads';
import { adsSearch } from './ads-api';
import { auditAdsAccountChanges } from './ads-account-change-audit';
import { auditPmaxLandings } from './ads-pmax-landing-audit';
import { auditSearchLandings } from './ads-search-landing-audit';
import { auditSearchTerms } from './ads-search-terms-audit';
import type { Ga4Env } from './ga4';
import { getAccessTokenFromServiceAccountJson } from './google-jwt';
import type { Env } from './env';

const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export type StorePictureEnv = Ga4Env & AdsEnv & Pick<Env, 'MARKETING_OPS_PREVIEW_KEY'>;

export type TabularReport = {
  id: string;
  dimensionHeaders: string[];
  metricHeaders: string[];
  rows: string[][];
  rowCount: number;
  error?: string;
};

function propertyPath(propertyId: string): string {
  const id = propertyId.trim();
  if (id.startsWith('properties/')) return id;
  return `properties/${id}`;
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function daysBetweenInclusive(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 14;
  return Math.min(90, Math.floor((b - a) / 86400000) + 1);
}

function pick(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function ga4Token(env: Ga4Env): Promise<string | null> {
  const jsonStr = (env.GA4_SERVICE_ACCOUNT_JSON ?? '').trim();
  if (!jsonStr) return null;
  return getAccessTokenFromServiceAccountJson(jsonStr, GA_SCOPE);
}

async function runGa4Report(
  env: Ga4Env,
  token: string,
  reportId: string,
  body: Record<string, unknown>,
): Promise<TabularReport> {
  const prop = (env.GA4_PROPERTY_ID ?? '').trim();
  if (!prop) {
    return {
      id: reportId,
      dimensionHeaders: [],
      metricHeaders: [],
      rows: [],
      rowCount: 0,
      error: 'missing GA4_PROPERTY_ID',
    };
  }
  const url = `https://analyticsdata.googleapis.com/v1beta/${propertyPath(prop)}:runReport`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      id: reportId,
      dimensionHeaders: [],
      metricHeaders: [],
      rows: [],
      rowCount: 0,
      error: `HTTP ${res.status}: ${text.slice(0, 400)}`,
    };
  }
  let data: {
    dimensionHeaders?: Array<{ name?: string }>;
    metricHeaders?: Array<{ name?: string }>;
    rows?: Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }>;
    }>;
  };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    return {
      id: reportId,
      dimensionHeaders: [],
      metricHeaders: [],
      rows: [],
      rowCount: 0,
      error: 'parse error',
    };
  }
  const dimensionHeaders = (data.dimensionHeaders ?? []).map((h) => h.name ?? '');
  const metricHeaders = (data.metricHeaders ?? []).map((h) => h.name ?? '');
  const rows = (data.rows ?? []).map((r) => {
    const dims = (r.dimensionValues ?? []).map((d) => d.value ?? '');
    const mets = (r.metricValues ?? []).map((m) => m.value ?? '');
    return [...dims, ...mets];
  });
  return {
    id: reportId,
    dimensionHeaders,
    metricHeaders,
    rows,
    rowCount: rows.length,
  };
}

function dateRangeBody(startDate: string, endDate: string): { dateRanges: Array<{ startDate: string; endDate: string }> } {
  return { dateRanges: [{ startDate, endDate }] };
}

async function fetchGa4Reports(
  env: Ga4Env,
  startDate: string,
  endDate: string,
): Promise<TabularReport[]> {
  const token = await ga4Token(env);
  if (!token) {
    const err = 'GA4_SERVICE_ACCOUNT_JSON missing or token failed';
    return ['ga4-daily', 'ga4-channel', 'ga4-source-medium', 'ga4-landing', 'ga4-device', 'ga4-funnel', 'ga4-purchases-daily', 'ga4-items'].map(
      (id) => ({
        id,
        dimensionHeaders: [],
        metricHeaders: [],
        rows: [],
        rowCount: 0,
        error: err,
      }),
    );
  }
  const dr = dateRangeBody(startDate, endDate);
  const reports: Array<Promise<TabularReport>> = [
    runGa4Report(env, token, 'ga4-daily', {
      ...dr,
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'engagedSessions' },
        { name: 'engagementRate' },
        { name: 'screenPageViews' },
      ],
      limit: 10000,
    }),
    runGa4Report(env, token, 'ga4-channel', {
      ...dr,
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'ecommercePurchases' }, { name: 'purchaseRevenue' }],
      limit: 10000,
    }),
    runGa4Report(env, token, 'ga4-source-medium', {
      ...dr,
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics: [{ name: 'sessions' }, { name: 'ecommercePurchases' }, { name: 'purchaseRevenue' }],
      limit: 10000,
    }),
    runGa4Report(env, token, 'ga4-landing', {
      ...dr,
      dimensions: [{ name: 'landingPage' }],
      metrics: [{ name: 'sessions' }, { name: 'ecommercePurchases' }, { name: 'purchaseRevenue' }],
      limit: 500,
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    }),
    runGa4Report(env, token, 'ga4-device', {
      ...dr,
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }, { name: 'ecommercePurchases' }, { name: 'purchaseRevenue' }],
      limit: 50,
    }),
    runGa4Report(env, token, 'ga4-funnel', {
      ...dr,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: {
            values: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'],
          },
        },
      },
      limit: 20,
    }),
    runGa4Report(env, token, 'ga4-purchases-daily', {
      ...dr,
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'ecommercePurchases' }, { name: 'purchaseRevenue' }],
      limit: 10000,
    }),
    runGa4Report(env, token, 'ga4-items', {
      ...dr,
      dimensions: [{ name: 'itemName' }],
      metrics: [{ name: 'itemsPurchased' }, { name: 'itemRevenue' }],
      limit: 500,
      orderBys: [{ metric: { metricName: 'itemRevenue' }, desc: true }],
    }),
  ];
  return Promise.all(reports);
}

async function adsCampaignDaily(env: AdsEnv, startDate: string, endDate: string): Promise<TabularReport> {
  const q = `
    SELECT
      campaign.id,
      campaign.name,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date, campaign.name
    LIMIT 10000
  `.trim();
  const search = await adsSearch(env, q);
  if (!search.ok) {
    return {
      id: 'ads-campaign-daily',
      dimensionHeaders: ['campaignId', 'campaignName', 'date'],
      metricHeaders: ['impressions', 'clicks', 'costMicros', 'conversions', 'conversionsValue'],
      rows: [],
      rowCount: 0,
      error: search.error,
    };
  }
  const rows = search.results.map((r) => [
    str(pick(r, ['campaign', 'id'])),
    str(pick(r, ['campaign', 'name'])),
    str(pick(r, ['segments', 'date'])),
    String(num(pick(r, ['metrics', 'impressions']))),
    String(num(pick(r, ['metrics', 'clicks']))),
    String(num(pick(r, ['metrics', 'costMicros']))),
    String(num(pick(r, ['metrics', 'conversions']))),
    String(num(pick(r, ['metrics', 'conversionsValue']))),
  ]);
  return {
    id: 'ads-campaign-daily',
    dimensionHeaders: ['campaignId', 'campaignName', 'date'],
    metricHeaders: ['impressions', 'clicks', 'costMicros', 'conversions', 'conversionsValue'],
    rows,
    rowCount: rows.length,
  };
}

async function adsCampaignSummary(env: AdsEnv, startDate: string, endDate: string): Promise<TabularReport> {
  const q = `
    SELECT
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.clicks DESC
    LIMIT 100
  `.trim();
  const search = await adsSearch(env, q);
  if (!search.ok) {
    return {
      id: 'ads-campaign-summary',
      dimensionHeaders: ['campaignId', 'campaignName'],
      metricHeaders: ['impressions', 'clicks', 'costMicros', 'conversions', 'conversionsValue'],
      rows: [],
      rowCount: 0,
      error: search.error,
    };
  }
  const agg = new Map<
    string,
    { id: string; name: string; imp: number; clk: number; cost: number; conv: number; val: number }
  >();
  for (const r of search.results) {
    const id = str(pick(r, ['campaign', 'id']));
    const name = str(pick(r, ['campaign', 'name']));
    const key = id || name;
    const cur = agg.get(key) ?? { id, name, imp: 0, clk: 0, cost: 0, conv: 0, val: 0 };
    cur.imp += num(pick(r, ['metrics', 'impressions']));
    cur.clk += num(pick(r, ['metrics', 'clicks']));
    cur.cost += num(pick(r, ['metrics', 'costMicros']));
    cur.conv += num(pick(r, ['metrics', 'conversions']));
    cur.val += num(pick(r, ['metrics', 'conversionsValue']));
    agg.set(key, cur);
  }
  const rows = [...agg.values()]
    .sort((a, b) => b.clk - a.clk)
    .map((c) => [
      c.id,
      c.name,
      String(c.imp),
      String(c.clk),
      String(c.cost),
      String(c.conv),
      String(c.val),
    ]);
  return {
    id: 'ads-campaign-summary',
    dimensionHeaders: ['campaignId', 'campaignName'],
    metricHeaders: ['impressions', 'clicks', 'costMicros', 'conversions', 'conversionsValue'],
    rows,
    rowCount: rows.length,
  };
}

export type StorePictureBody = {
  ok: boolean;
  readOnly: true;
  fetchedAt: string;
  window: { startDate: string; endDate: string };
  disclaimer: string;
  ga4: TabularReport[];
  ads: {
    campaignDaily: TabularReport;
    campaignSummary: TabularReport;
    searchTerms: Awaited<ReturnType<typeof auditSearchTerms>>;
    pmaxLandings: Awaited<ReturnType<typeof auditPmaxLandings>>;
    searchLandings: Awaited<ReturnType<typeof auditSearchLandings>>;
    conversionSnapshot: Awaited<ReturnType<typeof auditAdsAccountChanges>>;
  };
};

export async function buildStorePicture(
  env: StorePictureEnv,
  startDate: string,
  endDate: string,
): Promise<StorePictureBody> {
  const days = daysBetweenInclusive(startDate, endDate);
  const [ga4, campaignDaily, campaignSummary, searchTerms, pmaxLandings, searchLandings, conversionSnapshot] =
    await Promise.all([
      fetchGa4Reports(env, startDate, endDate),
      adsCampaignDaily(env, startDate, endDate),
      adsCampaignSummary(env, startDate, endDate),
      auditSearchTerms(env, {
        startDate,
        endDate,
        days,
        campaignNameContains: 'Search',
        limit: 300,
      }),
      auditPmaxLandings(env, { startDate, endDate, days, campaign: 'Epir_Forest-Dark' }),
      auditSearchLandings(env, { startDate, endDate, days }),
      auditAdsAccountChanges(env),
    ]);

  return {
    ok: true,
    readOnly: true,
    fetchedAt: new Date().toISOString(),
    window: { startDate, endDate },
    disclaimer:
      'Ads metrics.conversions ≠ Shopify orders. Success metric per freeze: paid Shopify orders with google/cpc. This pack is GA4 + Ads read-only only.',
    ga4,
    ads: {
      campaignDaily,
      campaignSummary,
      searchTerms,
      pmaxLandings,
      searchLandings,
      conversionSnapshot,
    },
  };
}

const STORE_PICTURE_PATH = '/ops/store-picture';

export async function handleStorePicture(req: Request, env: StorePictureEnv): Promise<Response | null> {
  const u = new URL(req.url);
  if (u.pathname !== STORE_PICTURE_PATH || req.method !== 'GET') return null;
  const key = (env.MARKETING_OPS_PREVIEW_KEY ?? '').trim();
  if (!key) return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  const auth = /^Bearer\s+(\S+)/i.exec(req.headers.get('Authorization') ?? '');
  if ((auth?.[1]?.trim() ?? '') !== key) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store' },
    });
  }

  const defaultEnd = '2026-10-26';
  const defaultStart = '2026-09-20';
  let startDate = u.searchParams.get('startDate') ?? defaultStart;
  let endDate = u.searchParams.get('endDate') ?? defaultEnd;
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return new Response(JSON.stringify({ ok: false, error: 'startDate/endDate must be YYYY-MM-DD' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  if (endDate < startDate) {
    return new Response(JSON.stringify({ ok: false, error: 'endDate before startDate' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const body = await buildStorePicture(env, startDate, endDate);
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
