import type { MarketingStreamRecord } from './schema';
import { getAccessTokenFromServiceAccountJson } from './google-jwt';

const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export interface Ga4Env {
  GA4_PROPERTY_ID?: string;
  /** Pełny JSON service account (secret). */
  GA4_SERVICE_ACCOUNT_JSON?: string;
}

function propertyPath(propertyId: string): string {
  const id = propertyId.trim();
  if (id.startsWith('properties/')) return id;
  return `properties/${id}`;
}

/** Wczoraj UTC jako YYYY-MM-DD */
export function yesterdayUtcDate(): string {
  const d = new Date(Date.now() - 86400000);
  return d.toISOString().slice(0, 10);
}

export async function fetchGa4MarketingRows(env: Ga4Env, date: string): Promise<MarketingStreamRecord[]> {
  const jsonStr = (env.GA4_SERVICE_ACCOUNT_JSON ?? '').trim();
  const prop = (env.GA4_PROPERTY_ID ?? '').trim();
  if (!jsonStr || !prop) {
    console.warn('[MARKETING_INGEST] GA4 skip: missing GA4_SERVICE_ACCOUNT_JSON or GA4_PROPERTY_ID');
    return [];
  }

  const token = await getAccessTokenFromServiceAccountJson(jsonStr, GA_SCOPE);
  if (!token) {
    console.error('[MARKETING_INGEST] GA4 skip: service-account token not obtained');
    return [];
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/${propertyPath(prop)}:runReport`;
  const body = {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: 'date' }, { name: 'sessionCampaignName' }, { name: 'sessionSource' }],
    metrics: [{ name: 'sessions' }, { name: 'eventCount' }, { name: 'totalRevenue' }],
    limit: 10000,
  };

  console.log('[MARKETING_INGEST] GA4 runReport request', { date, property: propertyPath(prop) });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('[MARKETING_INGEST] GA4 runReport HTTP', { status: res.status, body: errText.slice(0, 500) });
    return [];
  }
  const data = (await res.json()) as {
    rowCount?: number;
    rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  };
  const rows = data.rows ?? [];
  console.log('[MARKETING_INGEST] GA4 runReport response', { date, rowsReturned: rows.length, rowCount: data.rowCount ?? null });
  const out: MarketingStreamRecord[] = [];
  for (const r of rows) {
    const dims = r.dimensionValues ?? [];
    const mets = r.metricValues ?? [];
    const rawDate = dims[0]?.value ?? date;
    const rowDate =
      rawDate.length === 8 ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : rawDate;
    const campaignName = dims[1]?.value ?? null;
    const sessionSource = dims[2]?.value ?? null;
    const sessions = Number(mets[0]?.value ?? '0') || 0;
    const conversions = Number(mets[1]?.value ?? '0') || 0;
    const revenue = Number(mets[2]?.value ?? '0') || 0;
    out.push({
      source: 'google_analytics',
      date: rowDate.length === 10 ? rowDate : date,
      campaign_id: null,
      campaign_name: campaignName,
      session_source: sessionSource,
      metric_sessions: sessions,
      metric_conversions: conversions,
      metric_revenue: revenue,
      metric_impressions: null,
      metric_clicks: null,
      metric_cost: null,
    });
  }
  return out;
}
