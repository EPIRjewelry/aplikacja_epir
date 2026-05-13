/// <reference types="@cloudflare/workers-types" />

import { WorkerEntrypoint } from 'cloudflare:workers';

// ============================================================================
// WAREHOUSE BATCH WORKER (nazwa deploy: epir-bigquery-batch)
// Nocny eksport D1 → Cloudflare Pipelines (HTTP ingest) → Iceberg / R2 Data Catalog.
// run_analytics_query → R2 SQL (whitelist).
// Logs prefix: [WAREHOUSE_BATCH]
// ============================================================================

import { getR2AnalyticsSql, VALID_QUERY_IDS } from './analytics-queries';
import { postPipelineIngestBatch } from './pipeline-ingest';
import { isR2SqlQueryConfigured, runR2SqlJob } from './r2-sql-client';

interface Env {
  DB: D1Database;
  DB_CHATBOT: D1Database;
  /** Pipelines HTTP ingest — rekordy zgodne ze schematem tabeli zdarzeń pixel w Iceberg. */
  PIPELINE_PIXEL_INGEST_URL?: string;
  /** Pipelines HTTP ingest — rekordy zgodne ze schematem tabeli wiadomości w Iceberg. */
  PIPELINE_MESSAGES_INGEST_URL?: string;
  /** Opcjonalny Bearer dla obu endpointów (Workers Pipelines Send). */
  PIPELINE_INGEST_TOKEN?: string;
  /** R2 SQL — whitelist `run_analytics_query`. */
  R2_SQL_ACCOUNT_ID?: string;
  R2_SQL_WAREHOUSE_BUCKET?: string;
  R2_SQL_API_TOKEN?: string;
  WAREHOUSE_SQL_NAMESPACE?: string;
  WAREHOUSE_SQL_PIXEL_TABLE?: string;
  WAREHOUSE_SQL_MESSAGES_TABLE?: string;
}

const BATCH_SIZE = 100;

// ============================================================================
// Eksport pixel_events → Pipelines
// ============================================================================

async function exportPixelEvents(env: Env, lastExportAt: number): Promise<{ exported: number; maxTimestamp: number }> {
  const pipelineUrl = (env.PIPELINE_PIXEL_INGEST_URL ?? '').trim();
  if (!pipelineUrl) {
    return { exported: 0, maxTimestamp: lastExportAt };
  }
  const stmt = env.DB.prepare(
    `SELECT * FROM pixel_events WHERE (strftime('%s', created_at) * 1000) > ?1 ORDER BY created_at ASC`
  ).bind(lastExportAt);
  const result = await stmt.all<Record<string, unknown>>();
  const rows = result.results ?? [];
  if (rows.length === 0) return { exported: 0, maxTimestamp: lastExportAt };

  let totalInserted = 0;
  let maxTs = lastExportAt;
  const pipelineToken = env.PIPELINE_INGEST_TOKEN;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const records = chunk.map((r) => {
      const createdAt = r.created_at as string;
      return {
        event_type: r.event_type,
        session_id: r.session_id,
        customer_id: r.customer_id,
        storefront_id: r.storefront_id ?? null,
        channel: r.channel ?? null,
        url: r.page_url ?? '',
        payload: JSON.stringify(r),
        created_at: createdAt ?? new Date().toISOString(),
      };
    });

    const pr = await postPipelineIngestBatch(pipelineUrl, pipelineToken, records);
    if (!pr.ok) {
      console.error(`[WAREHOUSE_BATCH] pixel_events Pipeline chunk failed at offset ${i}:`, pr);
      break;
    }

    totalInserted += chunk.length;
    for (const r of chunk) {
      const createdAt = r.created_at as string;
      const ts = createdAt ? Math.floor(new Date(createdAt).getTime()) : 0;
      if (ts > maxTs) maxTs = ts;
    }
  }

  return { exported: totalInserted, maxTimestamp: maxTs };
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
    `SELECT * FROM messages WHERE timestamp > ?1 ORDER BY timestamp ASC`
  ).bind(lastExportAt);
  const result = await stmt.all<Record<string, unknown>>();
  const rows = result.results ?? [];
  if (rows.length === 0) return { exported: 0, maxTimestamp: lastExportAt };

  let totalInserted = 0;
  let maxTs = lastExportAt;
  const pipelineToken = env.PIPELINE_INGEST_TOKEN;

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

    const pr = await postPipelineIngestBatch(pipelineUrl, pipelineToken, records);
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

async function handleScheduled(env: Env): Promise<void> {
  console.log('[WAREHOUSE_BATCH] Starting scheduled export');

  const pixelPipeline = !!(env.PIPELINE_PIXEL_INGEST_URL ?? '').trim();
  const messagesPipeline = !!(env.PIPELINE_MESSAGES_INGEST_URL ?? '').trim();

  if (!pixelPipeline && !messagesPipeline) {
    console.warn('[WAREHOUSE_BATCH] Pipeline ingest URLs not configured, skipping');
    return;
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

  const now = Date.now();

  const pixelResult = await exportPixelEvents(env, lastPixel);
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

  console.log('[WAREHOUSE_BATCH] Export complete');
}

// ============================================================================
// Analytics Query (run_analytics_query – chat → service binding RPC, `ctx.props`)
// ============================================================================

type BigQueryS2SProps = { scopes?: string[] };

function requireBigQueryS2SScopes(props: BigQueryS2SProps | undefined, scope: string): void {
  const got = Array.isArray(props?.scopes) ? props.scopes : [];
  if (!got.includes(scope)) {
    throw new Error(`rpc:forbidden missing scope ${scope}`);
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
    return { ok: false, error, status: 500 };
  }
  return { ok: true, queryId, rows: rows ?? [] };
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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/healthz')) {
      return new Response('ok', { status: 200 });
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
    ctx.waitUntil(handleScheduled(env));
  },
};
