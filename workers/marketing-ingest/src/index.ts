/// <reference types="@cloudflare/workers-types" />

import type { Env } from './env';
import { fetchAdsMarketingRows } from './ads';
import { fetchGa4MarketingRows, yesterdayUtcDate } from './ga4';
import { handleMarketingPreview } from './ops-preview';
import { postPipelineIngestBatch } from './pipeline-post';
import {
  applySearchAdGroupUtmSuffixes,
  auditPmaxListingGroups,
  expandPmaxListingGroups,
  FOREST_UTM_SUFFIX,
  setCampaignFinalUrlSuffix,
} from './pmax-listing';

export { MarketingAnalystAgent } from './marketing-analyst-agent';
export { MarketingIngestS2SRpc } from './rpc';
export type { Env } from './env';

const BATCH = 200;

const MARKETING_ANALYST_PATH = /^\/ops\/marketing-analyst\/([^/]+)\/(refresh|state)$/;

function verifyMarketingOpsBearer(req: Request, env: Env): boolean {
  const key = (env.MARKETING_OPS_PREVIEW_KEY ?? '').trim();
  if (!key) return false;
  const m = /^Bearer\s+(\S+)/i.exec(req.headers.get('Authorization') ?? '');
  return (m?.[1]?.trim() ?? '') === key;
}

function opsUnauthorized(): Response {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store' },
  });
}

function opsJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** Bearer-gated PMax / Search UTM ops (reuse MARKETING_OPS_PREVIEW_KEY). */
async function handlePmaxOps(req: Request, env: Env): Promise<Response | null> {
  const u = new URL(req.url);
  const path = u.pathname;
  if (!path.startsWith('/ops/pmax-') && path !== '/ops/search-utm-suffixes') {
    return null;
  }
  const key = (env.MARKETING_OPS_PREVIEW_KEY ?? '').trim();
  if (!key) return new Response('Not Found', { status: 404 });
  if (!verifyMarketingOpsBearer(req, env)) return opsUnauthorized();

  if (path === '/ops/pmax-listing-audit' && req.method === 'GET') {
    const campaignName = u.searchParams.get('campaign') ?? undefined;
    return opsJson(await auditPmaxListingGroups(env, campaignName ?? undefined));
  }

  if (path === '/ops/pmax-listing-expand' && (req.method === 'POST' || req.method === 'GET')) {
    const dryRun = u.searchParams.get('dryRun') !== '0';
    const campaignName = u.searchParams.get('campaign') ?? undefined;
    return opsJson(
      await expandPmaxListingGroups(env, {
        campaignName,
        dryRun,
        excludeBrand: u.searchParams.get('excludeBrand') ?? undefined,
      }),
    );
  }

  if (path === '/ops/pmax-forest-utm' && (req.method === 'POST' || req.method === 'GET')) {
    const dryRun = u.searchParams.get('dryRun') !== '0';
    return opsJson(
      await setCampaignFinalUrlSuffix(env, {
        campaignName: u.searchParams.get('campaign') ?? 'Epir_Forest-Dark',
        finalUrlSuffix: FOREST_UTM_SUFFIX,
        dryRun,
      }),
    );
  }

  if (path === '/ops/search-utm-suffixes' && (req.method === 'POST' || req.method === 'GET')) {
    const dryRun = u.searchParams.get('dryRun') !== '0';
    return opsJson(await applySearchAdGroupUtmSuffixes(env, { dryRun }));
  }

  return new Response('Not Found', { status: 404 });
}

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
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const u = new URL(req.url);
    const analystMatch = MARKETING_ANALYST_PATH.exec(u.pathname);
    if (analystMatch) {
      const mode = analystMatch[2];
      if (!((req.method === 'POST' && mode === 'refresh') || (req.method === 'GET' && mode === 'state'))) {
        return new Response('Method Not Allowed', { status: 405, headers: { 'Cache-Control': 'no-store' } });
      }
      const key = (env.MARKETING_OPS_PREVIEW_KEY ?? '').trim();
      if (!key) {
        return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
      }
      if (!verifyMarketingOpsBearer(req, env)) {
        return new Response('Unauthorized', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store' },
        });
      }
      const instance = decodeURIComponent(analystMatch[1]);
      const id = env.MarketingAnalystAgent.idFromName(instance);
      const stub = env.MarketingAnalystAgent.get(id);
      return stub.fetch(req);
    }

    const preview = await handleMarketingPreview(req, env);
    if (preview) return preview;
    const pmaxOps = await handlePmaxOps(req, env);
    if (pmaxOps) return pmaxOps;
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/healthz')) {
      return new Response('ok', { status: 200 });
    }
    return new Response('Not Found', { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const date = yesterdayUtcDate();
    console.log('[MARKETING_INGEST] scheduled start', { date });

    const pipelineUrl = (env.MARKETING_PIPELINE_INGEST_URL ?? '').trim();
    if (!pipelineUrl) {
      console.warn('[MARKETING_INGEST] MARKETING_PIPELINE_INGEST_URL not set, skip ingest; preview still available');
    }

    ctx.waitUntil(
      (async () => {
        const ga = await fetchGa4MarketingRows(env, date);
        const r = pipelineUrl ? await sendBatches(env, ga as unknown as Record<string, unknown>[]) : { ok: true, sent: 0 };
        console.log('[MARKETING_INGEST] GA4', { date, rows: ga.length, sent: r.sent, ok: r.ok, pipelineUrlSet: !!pipelineUrl });
      })(),
    );

    ctx.waitUntil(
      (async () => {
        const ads = await fetchAdsMarketingRows(env, date);
        const r = pipelineUrl ? await sendBatches(env, ads as unknown as Record<string, unknown>[]) : { ok: true, sent: 0 };
        console.log('[MARKETING_INGEST] Ads', { date, rows: ads.length, sent: r.sent, ok: r.ok, pipelineUrlSet: !!pipelineUrl });
      })(),
    );
  },
};
