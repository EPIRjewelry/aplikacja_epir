/// <reference types="@cloudflare/workers-types" />

import { WorkerEntrypoint } from 'cloudflare:workers';

// ============================================================================
// WAREHOUSE BATCH WORKER (nazwa deploy: epir-bigquery-batch)
// Nocny eksport D1 → Cloudflare Pipelines (HTTP ingest) → Iceberg / R2 Data Catalog.
// run_analytics_query → R2 SQL (whitelist).
// Logs prefix: [WAREHOUSE_BATCH]
// ============================================================================

import { getR2AnalyticsSql, getQ9ToolUsageFallbackSql, isMissingIcebergNameColumnError, VALID_QUERY_IDS } from './analytics-queries';
import { PIXEL_CREATED_AT_MS_SQL, pixelCreatedAtIso, pixelCreatedAtMs } from './d1-timestamps';
import { buildFlowHealthReport } from './edog-flow-health-runner';
import { buildEdogNarrative } from './edog-reason-narrative';
import { runOperatorDailyReport } from './operator-daily-report';
import { runWarehouseExportCatchUp } from './warehouse-export-catchup';
import { postPipelineIngestBatch } from './pipeline-ingest';
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

const BATCH_SIZE = 100;
/** Maks. wierszy na jedno wywołanie (cron / trigger) — unika przekroczenia limitu subrequestów (~25 POST ingest). */
const MAX_PIXEL_ROWS_PER_RUN = 2500;
const MAX_MESSAGES_ROWS_PER_RUN = 2500;

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
// Eksport pixel_events → Pipelines
// ============================================================================

async function exportPixelEvents(
  env: Env,
  lastExportAt: number,
): Promise<{ exported: number; maxTimestamp: number; pipelineError?: string }> {
  const pipelineUrl = (env.PIPELINE_PIXEL_INGEST_URL ?? '').trim();
  if (!pipelineUrl) {
    return { exported: 0, maxTimestamp: lastExportAt };
  }
  try {
    const stmt = env.DB.prepare(
      `SELECT * FROM pixel_events WHERE ${PIXEL_CREATED_AT_MS_SQL} > ?1 ORDER BY ${PIXEL_CREATED_AT_MS_SQL} ASC LIMIT ?2`,
    ).bind(lastExportAt, MAX_PIXEL_ROWS_PER_RUN);
    const result = await stmt.all<Record<string, unknown>>();
    const rows = result.results ?? [];
    if (rows.length === 0) return { exported: 0, maxTimestamp: lastExportAt };

    let totalInserted = 0;
    let maxTs = lastExportAt;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);
      const records = chunk.map((r) => {
        const pageUrl = String(r.page_url ?? '').trim();
        return {
          event_type: r.event_type,
          session_id: r.session_id,
          customer_id: r.customer_id,
          storefront_id: r.storefront_id ?? null,
          channel: r.channel ?? null,
          // Stream schema: `url` required — puste page_url w D1 (~legacy) → placeholder (inaczej ingest odrzuca cały batch).
          url: pageUrl || 'https://epir.local/unknown',
          payload: JSON.stringify(r),
          created_at: pixelCreatedAtIso(r.created_at),
        };
      });

      const pr = await postPipelineIngestBatch(pipelineUrl, undefined, records);
      if (!pr.ok) {
        console.error(`[WAREHOUSE_BATCH] pixel_events Pipeline chunk failed at offset ${i}:`, pr);
        return {
          exported: totalInserted,
          maxTimestamp: maxTs,
          pipelineError: `pixel ingest HTTP ${pr.status}: ${pr.body.slice(0, 120)}`,
        };
      }

      totalInserted += chunk.length;
      for (const r of chunk) {
        const ts = pixelCreatedAtMs(r.created_at);
        if (ts > maxTs) maxTs = ts;
      }
    }

    return { exported: totalInserted, maxTimestamp: maxTs };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[WAREHOUSE_BATCH] pixel_events export failed:', msg);
    return { exported: 0, maxTimestamp: lastExportAt, pipelineError: `pixel export: ${msg}` };
  }
}

// ============================================================================
// Eksport messages → Pipelines
// ============================================================================

async function exportMessages(env: Env, lastExportAt: number): Promise<{ exported: number; maxTimestamp: number }> {
  const pipelineUrl = (env.PIPELINE_MESSAGES_INGEST_URL ?? '').trim();
  if (!pipelineUrl) {
    return { exported: 0, maxTimestamp: lastExportAt };
  }
  const stmt = env.DB_CHATBOT.prepare(
    `SELECT * FROM messages WHERE timestamp > ?1 ORDER BY timestamp ASC LIMIT ?2`,
  ).bind(lastExportAt, MAX_MESSAGES_ROWS_PER_RUN);
  const result = await stmt.all<Record<string, unknown>>();
  const rows = result.results ?? [];
  if (rows.length === 0) return { exported: 0, maxTimestamp: lastExportAt };

  let totalInserted = 0;
  let maxTs = lastExportAt;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const records = chunk.map((r) => ({
      id: r.id,
      session_id: r.session_id,
      role: r.role,
      content: r.content,
      timestamp: r.timestamp,
      tool_calls: r.tool_calls,
      tool_call_id: r.tool_call_id,
      name: r.name,
      storefront_id: r.storefront_id ?? null,
      channel: r.channel ?? null,
    }));

    const pr = await postPipelineIngestBatch(pipelineUrl, undefined, records);
    if (!pr.ok) {
      console.error(`[WAREHOUSE_BATCH] messages Pipeline chunk failed at offset ${i}:`, pr);
      break;
    }

    totalInserted += chunk.length;
    for (const r of chunk) {
      const ts = (r.timestamp as number) ?? 0;
      if (ts > maxTs) maxTs = ts;
    }
  }

  return { exported: totalInserted, maxTimestamp: maxTs };
}

// ============================================================================
// Scheduled handler
// ============================================================================

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

  let lastPixel = 0;
  let lastMessages = 0;
  try {
    const row = await env.DB.prepare(
      'SELECT last_pixel_export_at, last_messages_export_at FROM batch_exports WHERE id = 1'
    ).first<{ last_pixel_export_at: number; last_messages_export_at: number }>();
    if (row) {
      lastPixel = row.last_pixel_export_at ?? 0;
      lastMessages = row.last_messages_export_at ?? 0;
    }
  } catch (e) {
    console.warn('[WAREHOUSE_BATCH] batch_exports table missing or empty, using 0:', e);
  }

  let pendingPixel = 0;
  try {
    const pendingRow = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM pixel_events WHERE ${PIXEL_CREATED_AT_MS_SQL} > ?1`,
    )
      .bind(lastPixel)
      .first<{ cnt: number }>();
    pendingPixel = pendingRow?.cnt ?? 0;
  } catch {
    pendingPixel = -1;
  }
  console.log('[WAREHOUSE_BATCH] export_start', {
    pixelPipeline,
    messagesPipeline,
    pendingPixel,
    lastPixelWatermark: lastPixel,
    lastMessagesWatermark: lastMessages,
  });

  const now = Date.now();

  const pixelResult = await exportPixelEvents(env, lastPixel);
  const pipelineError = pixelResult.pipelineError;
  console.log(`[WAREHOUSE_BATCH] pixel_events: exported ${pixelResult.exported} rows`);

  const messagesResult = await exportMessages(env, lastMessages);
  console.log(`[WAREHOUSE_BATCH] messages: exported ${messagesResult.exported} rows`);

  const newPixelTs = pixelResult.exported > 0 ? pixelResult.maxTimestamp : lastPixel;
  const newMessagesTs = messagesResult.exported > 0 ? messagesResult.maxTimestamp : lastMessages;

  try {
    await env.DB.prepare(
      `INSERT INTO batch_exports (id, last_pixel_export_at, last_messages_export_at, updated_at)
       VALUES (1, ?1, ?2, ?3)
       ON CONFLICT(id) DO UPDATE SET
         last_pixel_export_at = excluded.last_pixel_export_at,
         last_messages_export_at = excluded.last_messages_export_at,
         updated_at = excluded.updated_at`
    )
      .bind(newPixelTs, newMessagesTs, now)
      .run();
    console.log('[WAREHOUSE_BATCH] batch_exports updated');
  } catch (e) {
    console.error('[WAREHOUSE_BATCH] Failed to update batch_exports:', e);
  }

  let pendingAfter = 0;
  try {
    const pendingRow = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM pixel_events WHERE ${PIXEL_CREATED_AT_MS_SQL} > ?1`,
    )
      .bind(newPixelTs)
      .first<{ cnt: number }>();
    pendingAfter = pendingRow?.cnt ?? 0;
  } catch {
    pendingAfter = -1;
  }

  const summary: WarehouseExportSummary = {
    pixelExported: pixelResult.exported,
    messagesExported: messagesResult.exported,
    last_pixel_export_at: newPixelTs,
    last_messages_export_at: newMessagesTs,
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
        const pending = await env.DB.prepare(
          `SELECT COUNT(*) AS cnt FROM pixel_events WHERE ${PIXEL_CREATED_AT_MS_SQL} > COALESCE((SELECT last_pixel_export_at FROM batch_exports WHERE id = 1), 0)`,
        ).first<{ cnt: number }>();
        pendingPixel = pending?.cnt ?? -1;
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
