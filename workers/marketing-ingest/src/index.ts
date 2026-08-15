/// <reference types="@cloudflare/workers-types" />

import type { Env } from './env';
import { fetchAdsMarketingRows } from './ads';
import { fetchGa4MarketingRows, yesterdayUtcDate } from './ga4';
import { handleMarketingPreview } from './ops-preview';
import { fetchGmcDiagnostics } from './gmc';
import { buildGmcSnapshotRecords } from './gmc-snapshot';
import { postPipelineIngestBatch } from './pipeline-post';
import {
  applySearchAdGroupUtmSuffixes,
  auditPmaxListingGroups,
  countShoppingProductsForPmax,
  expandPmaxListingGroups,
  expandPmaxListingGroupsSingleMetal,
  FOREST_UTM_SUFFIX,
  clonePmaxAssetGroup,
  disablePmaxLandings,
  parseMetalLabel,
  renamePmaxAssetGroup,
  setAssetGroupStatus,
  setCampaignFinalUrlSuffix,
} from './pmax-listing';
import {
  applyPmaxSearchThemes,
  auditPmaxSearchThemes,
} from './pmax-search-themes';
import { auditSearchTerms } from './ads-search-terms-audit';
import {
  applySearchNegatives,
  auditSearchNegatives,
} from './search-negatives';
import { auditSharedNegativeCoverage, applySharedNegativeAttachments } from './shared-negatives-audit';

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

/** Bearer-gated PMax / Search UTM / Search Themes ops (reuse MARKETING_OPS_PREVIEW_KEY). */
async function handlePmaxOps(req: Request, env: Env): Promise<Response | null> {
  const u = new URL(req.url);
  const path = u.pathname;
  const isOps =
    path.startsWith('/ops/pmax-') ||
    path === '/ops/gmc-diagnostics' ||
    path === '/ops/search-utm-suffixes' ||
    path === '/ops/search-terms-audit' ||
    path.startsWith('/ops/search-negatives') ||
    path === '/ops/shared-negatives-audit' ||
    path === '/ops/shared-negatives-apply' ||
    path === '/ops/pmax-landings-disable';
  if (!isOps) return null;
  const key = (env.MARKETING_OPS_PREVIEW_KEY ?? '').trim();
  if (!key) return new Response('Not Found', { status: 404 });
  if (!verifyMarketingOpsBearer(req, env)) return opsUnauthorized();

  if (path === '/ops/gmc-diagnostics' && req.method === 'GET') {
    return opsJson(await fetchGmcDiagnostics(env));
  }

  if (path === '/ops/pmax-listing-audit' && req.method === 'GET') {
    const campaignName = u.searchParams.get('campaign') ?? undefined;
    return opsJson(await auditPmaxListingGroups(env, campaignName ?? undefined));
  }

  if (path === '/ops/pmax-shopping-product-count' && req.method === 'GET') {
    const campaignName = u.searchParams.get('campaign') ?? undefined;
    return opsJson(await countShoppingProductsForPmax(env, { campaignName }));
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

  if (
    path === '/ops/pmax-listing-expand-metal' &&
    (req.method === 'POST' || req.method === 'GET')
  ) {
    const dryRun = u.searchParams.get('dryRun') !== '0';
    const assetGroup = u.searchParams.get('assetGroup') ?? '';
    const metalRaw = u.searchParams.get('metal') ?? '';
    const metal = parseMetalLabel(metalRaw);
    if (!assetGroup.trim()) {
      return opsJson({ ok: false, error: 'assetGroup required' }, 400);
    }
    if (!metal) {
      return opsJson({ ok: false, error: 'metal required (Srebro|Zloto)' }, 400);
    }
    return opsJson(
      await expandPmaxListingGroupsSingleMetal(env, {
        campaignName: u.searchParams.get('campaign') ?? undefined,
        assetGroupName: assetGroup,
        metal,
        dryRun,
        excludeBrand: u.searchParams.get('excludeBrand') ?? undefined,
      }),
    );
  }

  if (
    path === '/ops/pmax-asset-group-status' &&
    (req.method === 'POST' || req.method === 'GET')
  ) {
    const dryRun = u.searchParams.get('dryRun') !== '0';
    const assetGroup = u.searchParams.get('assetGroup') ?? '';
    const statusRaw = (u.searchParams.get('status') ?? '').toUpperCase();
    if (!assetGroup.trim()) {
      return opsJson({ ok: false, error: 'assetGroup required' }, 400);
    }
    if (statusRaw !== 'ENABLED' && statusRaw !== 'PAUSED') {
      return opsJson({ ok: false, error: 'status required (ENABLED|PAUSED)' }, 400);
    }
    return opsJson(
      await setAssetGroupStatus(env, {
        campaignName: u.searchParams.get('campaign') ?? undefined,
        assetGroupName: assetGroup,
        status: statusRaw,
        dryRun,
      }),
    );
  }

  if (
    path === '/ops/pmax-asset-group-rename' &&
    (req.method === 'POST' || req.method === 'GET')
  ) {
    const dryRun = u.searchParams.get('dryRun') !== '0';
    const assetGroup = u.searchParams.get('assetGroup') ?? '';
    const newName = u.searchParams.get('newName') ?? '';
    if (!assetGroup.trim() || !newName.trim()) {
      return opsJson({ ok: false, error: 'assetGroup and newName required' }, 400);
    }
    return opsJson(
      await renamePmaxAssetGroup(env, {
        campaignName: u.searchParams.get('campaign') ?? undefined,
        assetGroupName: assetGroup,
        newName,
        dryRun,
      }),
    );
  }

  if (
    path === '/ops/pmax-asset-group-clone' &&
    (req.method === 'POST' || req.method === 'GET')
  ) {
    const dryRun = u.searchParams.get('dryRun') !== '0';
    const source = u.searchParams.get('source') ?? '';
    const newName = u.searchParams.get('newName') ?? '';
    if (!source.trim() || !newName.trim()) {
      return opsJson({ ok: false, error: 'source and newName required' }, 400);
    }
    return opsJson(
      await clonePmaxAssetGroup(env, {
        campaignName: u.searchParams.get('campaign') ?? undefined,
        sourceAssetGroupName: source,
        newAssetGroupName: newName,
        dryRun,
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

  if (path === '/ops/pmax-landings-disable' && (req.method === 'POST' || req.method === 'GET')) {
    const dryRun = u.searchParams.get('dryRun') !== '0';
    return opsJson(
      await disablePmaxLandings(env, {
        campaignName: u.searchParams.get('campaign') ?? 'Epir_Forest-Dark',
        dryRun,
      }),
    );
  }

  if (path === '/ops/search-utm-suffixes' && (req.method === 'POST' || req.method === 'GET')) {
    const dryRun = u.searchParams.get('dryRun') !== '0';
    return opsJson(await applySearchAdGroupUtmSuffixes(env, { dryRun }));
  }

  if (path === '/ops/pmax-search-themes-audit' && req.method === 'GET') {
    const campaignName = u.searchParams.get('campaign') ?? undefined;
    const assetGroupName = u.searchParams.get('assetGroup') ?? undefined;
    return opsJson(await auditPmaxSearchThemes(env, { campaignName, assetGroupName }));
  }

  if (
    path === '/ops/pmax-search-themes-apply' &&
    (req.method === 'POST' || req.method === 'GET')
  ) {
    const dryRun = u.searchParams.get('dryRun') !== '0';
    const campaignName = u.searchParams.get('campaign') ?? undefined;
    const assetGroupName = u.searchParams.get('assetGroup') ?? undefined;
    return opsJson(
      await applyPmaxSearchThemes(env, { campaignName, assetGroupName, dryRun }),
    );
  }

  if (path === '/ops/search-terms-audit' && req.method === 'GET') {
    const days = Number.parseInt(u.searchParams.get('days') ?? '14', 10);
    const campaign = u.searchParams.get('campaign') ?? undefined;
    const limit = Number.parseInt(u.searchParams.get('limit') ?? '200', 10);
    return opsJson(
      await auditSearchTerms(env, {
        days: Number.isFinite(days) ? days : 14,
        campaignNameContains: campaign,
        limit: Number.isFinite(limit) ? limit : 200,
      }),
    );
  }

  if (path === '/ops/search-negatives-audit' && req.method === 'GET') {
    const campaignFilter = u.searchParams.get('campaignFilter') ?? undefined;
    return opsJson(await auditSearchNegatives(env, { campaignFilter }));
  }

  if (path === '/ops/shared-negatives-audit' && req.method === 'GET') {
    return opsJson(await auditSharedNegativeCoverage(env));
  }

  if (
    path === '/ops/shared-negatives-apply' &&
    (req.method === 'POST' || req.method === 'GET')
  ) {
    const dryRun = u.searchParams.get('dryRun') !== '0';
    return opsJson(await applySharedNegativeAttachments(env, { dryRun }));
  }

  if (
    path === '/ops/search-negatives-apply' &&
    (req.method === 'POST' || req.method === 'GET')
  ) {
    const dryRun = u.searchParams.get('dryRun') !== '0';
    const campaignFilter = u.searchParams.get('campaignFilter') ?? undefined;
    return opsJson(await applySearchNegatives(env, { campaignFilter, dryRun }));
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
    if (req.method === 'GET' && u.pathname === '/feed/gmc_feed.csv') {
      const bucket = env.GMC_FEED;
      if (!bucket) {
        return new Response('GMC feed binding missing', { status: 503 });
      }
      const obj = await bucket.get('gmc_feed.csv');
      if (!obj) {
        return new Response('gmc_feed.csv not generated yet', { status: 404 });
      }
      return new Response(obj.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }
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

    // GMC snapshot — osobny kształt (source=google_merchant), nie MarketingStreamRecord kampanii.
    ctx.waitUntil(
      (async () => {
        const gmcRows = await buildGmcSnapshotRecords(env, date);
        const r = pipelineUrl
          ? await sendBatches(env, gmcRows as unknown as Record<string, unknown>[])
          : { ok: true, sent: 0 };
        console.log('[MARKETING_INGEST] GMC snapshot', {
          date,
          rows: gmcRows.length,
          sent: r.sent,
          ok: r.ok,
          pipelineUrlSet: !!pipelineUrl,
        });
      })(),
    );
  },
};
