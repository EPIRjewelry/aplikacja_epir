/// <reference types="@cloudflare/workers-types" />

import { WorkerEntrypoint } from 'cloudflare:workers';

// ============================================================================
// WAREHOUSE BATCH WORKER (nazwa deploy: epir-bigquery-batch)
// Nocny eksport D1 → Cloudflare Pipelines (HTTP ingest) → Iceberg / R2 Data Catalog.
// run_analytics_query → R2 SQL (whitelist).
// Logs prefix: [WAREHOUSE_BATCH]
// ============================================================================

import { getR2AnalyticsSql, getQ9ToolUsageFallbackSql, isMissingIcebergNameColumnError, VALID_QUERY_IDS } from './analytics-queries';
import { buildFlowHealthReport } from './edog-flow-health-runner';
import { buildEdogNarrative } from './edog-reason-narrative';
import { runOperatorDailyReport } from './operator-daily-report';
import { runWarehouseExportCatchUp } from './warehouse-export-catchup';
import {
  countPendingPixel,
  exportMessages,
  exportOrderAttributions,
  exportPixelEvents,
  loadExportWatermark,
  type ExportWatermark,
} from './warehouse-pixel-export';
import { isR2SqlQueryConfigured, runR2SqlJob } from './r2-sql-client';
import { epirDebugLog } from './epir-debug-log';

interface Env {
  DB: D1Database;
  DB_CHATBOT: D1Database;
  /** Pipelines HTTP ingest — rekordy zgodne ze schematem tabeli zdarzeń pixel w Iceberg. */
  PIPELINE_PIXEL_INGEST_URL?: string;
  /** Pipelines HTTP ingest — rekordy zgodne ze schematem tabeli wiadomości w Iceberg. */
  PIPELINE_MESSAGES_INGEST_URL?: string;
  /** R2 SQL — whitelist `run_analytics_query`. */
  R2_SQL_ACCOUNT_ID?: string;
  R2_SQL_WAREHOUSE_BUCKET?: string;
  R2_SQL_API_TOKEN?: string;
  WAREHOUSE_SQL_NAMESPACE?: string;
  WAREHOUSE_SQL_PIXEL_TABLE?: string;
  WAREHOUSE_SQL_MESSAGES_TABLE?: string;
  /** @deprecated — HTTP /internal/* wyłączone; użyj RPC z czatu. */
  DATA_GUARDIAN_OPS_KEY?: string;
  /** Opcjonalny KV — ostatni raport crona (klucz `edog:latest`). */
  DATA_GUARDIAN_KV?: KVNamespace;
  /** Podgląd marketingu w raporcie operatora (RPC). */
  MARKETING_INGEST_RPC?: {
    getMarketingPreview(args?: { date?: string }): Promise<Record<string, unknown>>;
  };
  /** Opcjonalny webhook (np. Google Apps Script) — zapis raportu na Drive. */
  GWORKSPACE_REPORT_WEBHOOK_URL?: string;
  /** `1` / `true` — id, customer_id, order_id w streamie + eksport order_attributions. */
  PIPELINE_EXPORT_EXTENDED_FIELDS?: string;
}

const EDOG_KV_KEY = 'edog:latest';
const CRON_EXPORT = '0 2 * * *';
const CRON_EDOG_08 = '0 8 * * *';
const CRON_EDOG_20 = '0 20 * * *';
const CRON_OPERATOR_REPORT = '0 9 * * *';

/** HTTP operator endpoints usunięte — wyłącznie RPC (`BigQueryBatchS2SRpc`) lub cron. */
function deprecatedInternalHttp(): Response {
  return new Response(
    JSON.stringify({
      error: 'deprecated_use_rpc',
      hint: 'flow-health i trigger-export: BIGQUERY_BATCH_RPC z workera czatu (/internal/operator-studio/api/*).',
    }),
    { status: 404, headers: { 'Content-Type': 'application/json' } },
  );
}

async function probeQ1ForEdog(env: Env): Promise<{
  rowCount: number | null;
  skipped: boolean;
  error?: string;
  totalPixelSessions?: number | null;
}> {
  const result = await executeRunAnalyticsQuery(env, { queryId: 'Q1_CONVERSION_CHAT' });
  if (!result.ok) {
    return { rowCount: null, skipped: false, error: result.error };
  }
  const first = result.rows[0];
  const raw = first?.total_pixel_sessions;
  const totalPixelSessions =
    typeof raw === 'number' && Number.isFinite(raw)
      ? raw
      : typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))
        ? Number(raw)
        : null;
  return { rowCount: result.rows.length, skipped: false, totalPixelSessions };
}

async function runEdogHealthMonitor(env: Env): Promise<void> {
  const report = await buildFlowHealthReport(env, probeQ1ForEdog);
  console.log('[EDOG]', JSON.stringify({ verdict: report.edog_verdict, reasons: report.reasons }));
  if (env.DATA_GUARDIAN_KV) {
    await env.DATA_GUARDIAN_KV.put(EDOG_KV_KEY, JSON.stringify(report), { expirationTtl: 604_800 });
  }
}

async function runOperatorReportCron(env: Env): Promise<void> {
  const catchUp = await runWarehouseExportCatchUp(() => handleScheduled(env));
  const exportCatchUpNote =
    catchUp.runs > 0
      ? `Automatyczny catch-up przed raportem: ${catchUp.runs} przebieg(ów), pending_pixel po eksporcie: ${catchUp.lastPending}${catchUp.pipelineError ? `; pipeline: ${catchUp.pipelineError}` : ''}.`
      : undefined;
  if (catchUp.runs > 0) {
    console.log('[operator-report] warehouse catch-up', catchUp);
  }
  await runOperatorDailyReport(
    env,
    probeQ1ForEdog,
    (e) => executeRunAnalyticsQuery(e as Env, { queryId: 'Q8_DAILY_EVENTS' }),
    { exportCatchUpNote },
  );
}

/** Maks. wierszy na jedno wywołanie (cron / trigger) — unika przekroczenia limitu subrequestów (~25 POST ingest). */
const MAX_ROWS_PER_RUN = 2500;

export type WarehouseExportSummary = {
  pixelExported: number;
  messagesExported: number;
  last_pixel_export_at: number;
  last_messages_export_at: number;
  pending_pixel_after: number;
  partial: boolean;
  pipeline_error?: string;
};


// ============================================================================
// Scheduled handler
// ============================================================================

async function persistWatermark(env: Env, wm: ExportWatermark, now: number): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO batch_exports (
         id, last_pixel_export_at, last_pixel_export_id, last_messages_export_at,
         last_orders_export_at, last_orders_export_id, updated_at
       )
       VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(id) DO UPDATE SET
         last_pixel_export_at = excluded.last_pixel_export_at,
         last_pixel_export_id = excluded.last_pixel_export_id,
         last_messages_export_at = excluded.last_messages_export_at,
         last_orders_export_at = excluded.last_orders_export_at,
         last_orders_export_id = excluded.last_orders_export_id,
         updated_at = excluded.updated_at`,
    )
      .bind(
        wm.last_pixel_export_at,
        wm.last_pixel_export_id,
        wm.last_messages_export_at,
        wm.last_orders_export_at,
        wm.last_orders_export_id,
        now,
      )
      .run();
  } catch {
    await env.DB.prepare(
      `INSERT INTO batch_exports (id, last_pixel_export_at, last_messages_export_at, updated_at)
       VALUES (1, ?1, ?2, ?3)
       ON CONFLICT(id) DO UPDATE SET
         last_pixel_export_at = excluded.last_pixel_export_at,
         last_messages_export_at = excluded.last_messages_export_at,
         updated_at = excluded.updated_at`,
    )
      .bind(wm.last_pixel_export_at, wm.last_messages_export_at, now)
      .run();
  }
}

async function handleScheduled(env: Env): Promise<WarehouseExportSummary | null> {
  console.log('[WAREHOUSE_BATCH] Starting scheduled export');
  epirDebugLog('index.ts:handleScheduled', 'entry', {}, 'H-A');

  const pixelPipeline = !!(env.PIPELINE_PIXEL_INGEST_URL ?? '').trim();
  const messagesPipeline = !!(env.PIPELINE_MESSAGES_INGEST_URL ?? '').trim();

  if (!pixelPipeline && !messagesPipeline) {
    console.warn('[WAREHOUSE_BATCH] Pipeline ingest URLs not configured, skipping');
    epirDebugLog('index.ts:handleScheduled', 'export_skipped_no_pipeline', {}, 'H-E');
    return null;
  }

  const wm = await loadExportWatermark(env.DB);

  let pendingPixel = 0;
  try {
    pendingPixel = await countPendingPixel(env.DB, wm);
  } catch {
    pendingPixel = -1;
  }
  console.log('[WAREHOUSE_BATCH] export_start', {
    pixelPipeline,
    messagesPipeline,
    pendingPixel,
    watermark: wm,
  });

  const now = Date.now();

  const pixelResult = await exportPixelEvents(env, wm, MAX_ROWS_PER_RUN);
  const ordersResult = await exportOrderAttributions(env, wm, MAX_ROWS_PER_RUN);
  const messagesResult = await exportMessages(env, wm, MAX_ROWS_PER_RUN);

  const pipelineError =
    pixelResult.pipelineError ?? ordersResult.pipelineError ?? messagesResult.pipelineError;

  console.log(`[WAREHOUSE_BATCH] pixel_events: exported ${pixelResult.exported} rows`);
  console.log(`[WAREHOUSE_BATCH] order_attributions: exported ${ordersResult.exported} rows`);
  console.log(`[WAREHOUSE_BATCH] messages: exported ${messagesResult.exported} rows`);

  const nextWm: ExportWatermark = {
    last_pixel_export_at:
      pixelResult.exported > 0 ? pixelResult.cursor.last_pixel_export_at : wm.last_pixel_export_at,
    last_pixel_export_id:
      pixelResult.exported > 0 ? pixelResult.cursor.last_pixel_export_id : wm.last_pixel_export_id,
    last_messages_export_at:
      messagesResult.exported > 0
        ? messagesResult.cursor.last_messages_export_at
        : wm.last_messages_export_at,
    last_orders_export_at:
      ordersResult.exported > 0 ? ordersResult.cursor.last_orders_export_at : wm.last_orders_export_at,
    last_orders_export_id:
      ordersResult.exported > 0 ? ordersResult.cursor.last_orders_export_id : wm.last_orders_export_id,
  };

  if (pipelineError) {
    console.error('[WAREHOUSE_BATCH] pipeline error (partial watermark may still advance):', pipelineError);
  }
  await persistWatermark(env, nextWm, now);

  let pendingAfter = 0;
  try {
    pendingAfter = await countPendingPixel(env.DB, nextWm);
  } catch {
    pendingAfter = -1;
  }

  const summary: WarehouseExportSummary = {
    pixelExported: pixelResult.exported,
    messagesExported: messagesResult.exported,
    last_pixel_export_at: nextWm.last_pixel_export_at,
    last_messages_export_at: nextWm.last_messages_export_at,
    pending_pixel_after: pendingAfter,
    partial: pendingAfter > 0,
    ...(pipelineError ? { pipeline_error: pipelineError } : {}),
  };
  epirDebugLog('index.ts:handleScheduled', 'export_complete', {
    pixelExported: summary.pixelExported,
    pendingAfter: summary.pending_pixel_after,
    batchUpdatedAt: now,
    pipelineError: pipelineError ?? null,
  }, 'H-C');
  console.log('[WAREHOUSE_BATCH] Export complete', summary);
  return summary;
}

// ============================================================================
// Analytics Query (run_analytics_query – chat → service binding RPC, `ctx.props`)
// ============================================================================

type BigQueryS2SProps = { scopes?: string[] };

function requireBigQueryS2SScopes(props: BigQueryS2SProps | undefined, scope: string): void {
  const got = Array.isArray(props?.scopes) ? props.scopes : [];
  if (!got.includes(scope)) {
    const hint =
      got.length === 0
        ? ' (ctx.props.scopes puste — zwykle brak `[services.props] scopes` na bindingu wołającego workera albo stary deploy; zrób `wrangler deploy` z `workers/chat` lub `workers/analyst-worker`, lokalnie: jeden `wrangler dev -c …` dla wielu workerów)'
        : '';
    throw new Error(`rpc:forbidden missing scope ${scope}${hint}`);
  }
}

async function executeRunAnalyticsQuery(
  env: Env,
  body: { queryId?: string },
): Promise<
  | { ok: true; queryId: string; rows: Record<string, unknown>[] }
  | { ok: false; error: string; status: number }
> {
  const queryId = body?.queryId;
  if (!queryId || typeof queryId !== 'string') {
    return { ok: false, error: `queryId required; validIds: ${VALID_QUERY_IDS.join(',')}`, status: 400 };
  }
  if (!isR2SqlQueryConfigured(env)) {
    return {
      ok: false,
      error:
        'R2 SQL not configured for run_analytics_query (set R2_SQL_ACCOUNT_ID, R2_SQL_WAREHOUSE_BUCKET, wrangler secret put R2_SQL_API_TOKEN)',
      status: 503,
    };
  }
  let sql: string | undefined;
  try {
    sql = getR2AnalyticsSql(env, queryId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, status: 500 };
  }
  if (!sql) {
    return { ok: false, error: `Invalid queryId: ${queryId}`, status: 400 };
  }
  const { rows, error } = await runR2SqlJob(env, sql);
  if (error) {
    if (queryId === 'Q9_TOOL_USAGE' && isMissingIcebergNameColumnError(error)) {
      const fallbackSql = getQ9ToolUsageFallbackSql(env);
      const fallback = await runR2SqlJob(env, fallbackSql);
      if (fallback.error) {
        return { ok: false, error: fallback.error, status: 500 };
      }
      console.warn('[WAREHOUSE_BATCH] Q9 fallback: messages_raw missing name column — pipeline must map name');
      return { ok: true, queryId, rows: fallback.rows ?? [] };
    }
    return { ok: false, error, status: 500 };
  }
  const rowList = rows ?? [];
  return { ok: true, queryId, rows: rowList };
}

/** S2S whitelisted queries (R2 SQL) — wywoływane wyłącznie z `epir-art-jewellery-worker` przez service binding. Zakres RPC: `bigquery.analytics_query` (nazwa historyczna). */
export class BigQueryBatchS2SRpc extends WorkerEntrypoint<Env, BigQueryS2SProps> {
  async runAnalyticsQuery(args: { queryId?: string }): Promise<
    | { ok: true; queryId: string; rows: Record<string, unknown>[] }
    | { ok: false; error: string; status: number }
  > {
    requireBigQueryS2SScopes(this.ctx.props, 'bigquery.analytics_query');
    return executeRunAnalyticsQuery(this.env, args ?? {});
  }

  /** Ręczny eksport D1→Pipelines — catch-up do targetPending (jak cron 02:00 / raport 09:00). */
  async triggerWarehouseExport(): Promise<{
    ok: true;
    summary: WarehouseExportSummary | null;
    catchUp: { runs: number; lastPending: number; pipelineError?: string };
  }> {
    requireBigQueryS2SScopes(this.ctx.props, 'bigquery.analytics_query');
    epirDebugLog('index.ts:triggerWarehouseExport', 'catchup_start', { maxRuns: 12, targetPending: 1000 }, 'H-A');
    const catchUp = await runWarehouseExportCatchUp(() => handleScheduled(this.env), {
      maxRuns: 12,
      targetPending: 1000,
    });
    epirDebugLog('index.ts:triggerWarehouseExport', 'catchup_done', {
      runs: catchUp.runs,
      lastPending: catchUp.lastPending,
      pipelineError: catchUp.pipelineError ?? null,
    }, 'H-C');
    console.log('[WAREHOUSE_BATCH] triggerWarehouseExport catch-up', catchUp);
    return {
      ok: true,
      summary: (catchUp.lastSummary as WarehouseExportSummary | null) ?? null,
      catchUp: {
        runs: catchUp.runs,
        lastPending: catchUp.lastPending,
        ...(catchUp.pipelineError ? { pipelineError: catchUp.pipelineError } : {}),
      },
    };
  }

  /** EDOG flow-health — ten sam scope co run_analytics_query (S2S z czatu). */
  async getFlowHealth(): Promise<
    Awaited<ReturnType<typeof buildFlowHealthReport>> & { narrative_markdown: string }
  > {
    requireBigQueryS2SScopes(this.ctx.props, 'bigquery.analytics_query');
    const report = await buildFlowHealthReport(this.env, probeQ1ForEdog);
    return { ...report, narrative_markdown: buildEdogNarrative(report).markdown };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/healthz')) {
      return new Response('ok', { status: 200 });
    }
    if (request.method === 'GET' && url.pathname === '/internal/flow-health') {
      return deprecatedInternalHttp();
    }
    if (request.method === 'GET' && url.pathname === '/internal/export-status') {
      let pendingPixel = -1;
      let batchRow: { last_pixel_export_at: number; last_messages_export_at: number; updated_at: number } | null =
        null;
      try {
        const wm = await loadExportWatermark(env.DB);
        pendingPixel = await countPendingPixel(env.DB, wm);
        batchRow = await env.DB.prepare(
          'SELECT last_pixel_export_at, last_messages_export_at, updated_at FROM batch_exports WHERE id = 1',
        ).first();
      } catch {
        /* ignore */
      }
      return Response.json({
        pending_pixel_events: pendingPixel,
        batch_exports: batchRow,
        pipeline_pixel_configured: !!(env.PIPELINE_PIXEL_INGEST_URL ?? '').trim(),
        pipeline_messages_configured: !!(env.PIPELINE_MESSAGES_INGEST_URL ?? '').trim(),
      });
    }
    if (request.method === 'POST' && url.pathname === '/internal/trigger-export') {
      return deprecatedInternalHttp();
    }
    if (request.method === 'POST' && url.pathname === '/internal/analytics/query') {
      return new Response(JSON.stringify({ error: 'analytics_query_deprecated_use_rpc' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const cron = event.cron ?? '';
    if (cron === CRON_OPERATOR_REPORT) {
      ctx.waitUntil(runOperatorReportCron(env));
      return;
    }
    if (cron === CRON_EDOG_08 || cron === CRON_EDOG_20) {
      ctx.waitUntil(runEdogHealthMonitor(env));
      return;
    }
    if (cron === CRON_EXPORT) {
      ctx.waitUntil(
        runWarehouseExportCatchUp(() => handleScheduled(env), { maxRuns: 12, targetPending: 1000 }).then(
          (catchUp) => {
            if (catchUp.runs > 0) {
              console.log('[WAREHOUSE_BATCH] Nightly catch-up', catchUp);
            }
            if (catchUp.pipelineError) {
              console.warn('[WAREHOUSE_BATCH] Nightly catch-up pipeline error:', catchUp.pipelineError);
            }
            if (catchUp.lastPending > 1000) {
              console.warn('[WAREHOUSE_BATCH] Nightly catch-up partial; pending pixel:', catchUp.lastPending);
            }
          },
        ),
      );
      return;
    }
    ctx.waitUntil(handleScheduled(env).then((s) => {
      if (s?.partial) {
        console.warn('[WAREHOUSE_BATCH] Cron partial export; pending pixel rows remain:', s.pending_pixel_after);
      }
    }));
  },
};
