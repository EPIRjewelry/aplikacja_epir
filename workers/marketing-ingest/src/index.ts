/// <reference types="@cloudflare/workers-types" />

import { fetchAdsMarketingRows } from './ads';
import { fetchGa4MarketingRows, yesterdayUtcDate } from './ga4';
import { postPipelineIngestBatch } from './pipeline-post';

export interface Env {
  /** HTTP ingest Pipelines (marketing stream). */
  MARKETING_PIPELINE_INGEST_URL?: string;
  MARKETING_PIPELINE_INGEST_TOKEN?: string;
  GA4_PROPERTY_ID?: string;
  GA4_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_ADS_CLIENT_ID?: string;
  GOOGLE_ADS_CLIENT_SECRET?: string;
  GOOGLE_ADS_REFRESH_TOKEN?: string;
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;
  GOOGLE_ADS_CUSTOMER_ID?: string;
}

const BATCH = 200;

async function sendBatches(env: Env, records: Record<string, unknown>[]): Promise<{ ok: boolean; sent: number }> {
  const url = (env.MARKETING_PIPELINE_INGEST_URL ?? '').trim();
  const tok = env.MARKETING_PIPELINE_INGEST_TOKEN;
  if (!url || records.length === 0) return { ok: true, sent: 0 };
  let sent = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const pr = await postPipelineIngestBatch(url, tok, chunk);
    if (!pr.ok) {
      console.error('[MARKETING_INGEST] pipeline batch failed', i, pr);
      return { ok: false, sent };
    }
    sent += chunk.length;
  }
  return { ok: true, sent };
}

export default {
  async fetch(req: Request): Promise<Response> {
    const u = new URL(req.url);
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/healthz')) {
      return new Response('ok', { status: 200 });
    }
    return new Response('Not Found', { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const date = yesterdayUtcDate();
    console.log('[MARKETING_INGEST] scheduled start', { date });

    if (!(env.MARKETING_PIPELINE_INGEST_URL ?? '').trim()) {
      console.warn('[MARKETING_INGEST] MARKETING_PIPELINE_INGEST_URL not set, skip');
      return;
    }

    ctx.waitUntil(
      (async () => {
        const ga = await fetchGa4MarketingRows(env, date);
        const r = await sendBatches(env, ga);
        console.log('[MARKETING_INGEST] GA4', { rows: ga.length, sent: r.sent, ok: r.ok });
      })(),
    );

    ctx.waitUntil(
      (async () => {
        const ads = await fetchAdsMarketingRows(env, date);
        const r = await sendBatches(env, ads);
        console.log('[MARKETING_INGEST] Ads', { rows: ads.length, sent: r.sent, ok: r.ok });
      })(),
    );
  },
};
