/**
 * Zbiera metryki D1 + opcjonalnie Q1 i zwraca pełny raport flow-health.
 */

export interface EdogFlowHealthEnv {
  DB: D1Database;
  DB_CHATBOT: D1Database;
  PIPELINE_PIXEL_INGEST_URL?: string;
  PIPELINE_MESSAGES_INGEST_URL?: string;
}
import {
  computeEdogVerdict,
  shouldProbeWarehouseQ1,
  since24hMs,
  type FlowHealthSnapshot,
} from './edog-flow-health';

export type FlowHealthReport = FlowHealthSnapshot & {
  edog_verdict: 'PASS' | 'FAIL' | 'DEGRADED';
  reasons: string[];
};

type Q1Probe = {
  rowCount: number | null;
  skipped: boolean;
  error?: string;
};

async function countPixel24h(env: EdogFlowHealthEnv, sinceMs: number): Promise<number> {
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM pixel_events WHERE CAST(created_at AS INTEGER) >= ?1',
    )
      .bind(sinceMs)
      .first<{ cnt: number }>();
    return row?.cnt ?? 0;
  } catch {
    return -1;
  }
}

async function countMessages24h(env: EdogFlowHealthEnv, sinceMs: number): Promise<number> {
  try {
    const row = await env.DB_CHATBOT.prepare(
      'SELECT COUNT(*) AS cnt FROM messages WHERE CAST(timestamp AS INTEGER) >= ?1',
    )
      .bind(sinceMs)
      .first<{ cnt: number }>();
    return row?.cnt ?? 0;
  } catch {
    return -1;
  }
}

async function loadExportStatus(env: EdogFlowHealthEnv): Promise<{
  pending_pixel_events: number;
  batch_exports: FlowHealthSnapshot['batch_exports'];
  pipeline_pixel_configured: boolean;
  pipeline_messages_configured: boolean;
}> {
  let pendingPixel = -1;
  let batchRow: FlowHealthSnapshot['batch_exports'] = null;
  try {
    const pending = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM pixel_events WHERE CAST(created_at AS INTEGER) > COALESCE((SELECT last_pixel_export_at FROM batch_exports WHERE id = 1), 0)',
    ).first<{ cnt: number }>();
    pendingPixel = pending?.cnt ?? -1;
    batchRow = await env.DB.prepare(
      'SELECT last_pixel_export_at, last_messages_export_at, updated_at FROM batch_exports WHERE id = 1',
    ).first();
  } catch {
    /* ignore */
  }
  return {
    pending_pixel_events: pendingPixel,
    batch_exports: batchRow,
    pipeline_pixel_configured: !!(env.PIPELINE_PIXEL_INGEST_URL ?? '').trim(),
    pipeline_messages_configured: !!(env.PIPELINE_MESSAGES_INGEST_URL ?? '').trim(),
  };
}

export async function buildFlowHealthReport(
  env: EdogFlowHealthEnv,
  probeQ1: (env: EdogFlowHealthEnv) => Promise<Q1Probe>,
): Promise<FlowHealthReport> {
  const nowMs = Date.now();
  const sinceMs = since24hMs(nowMs);
  const status = await loadExportStatus(env);
  const d1_pixel_events_24h = await countPixel24h(env, sinceMs);
  const d1_messages_24h = await countMessages24h(env, sinceMs);

  const inputBase = {
    pending_pixel_events: status.pending_pixel_events,
    batch_exports_updated_at_ms: status.batch_exports?.updated_at ?? 0,
    now_ms: nowMs,
    pipeline_pixel_configured: status.pipeline_pixel_configured,
    pipeline_messages_configured: status.pipeline_messages_configured,
    d1_pixel_events_24h: d1_pixel_events_24h < 0 ? 0 : d1_pixel_events_24h,
    d1_messages_24h: d1_messages_24h < 0 ? 0 : d1_messages_24h,
    warehouse_q1_row_count: null as number | null,
    warehouse_q1_skipped: true,
    warehouse_q1_error: undefined as string | undefined,
  };

  let q1: Q1Probe = { rowCount: null, skipped: true };
  if (shouldProbeWarehouseQ1(inputBase)) {
    q1 = await probeQ1(env);
  }

  const input = {
    ...inputBase,
    warehouse_q1_row_count: q1.rowCount,
    warehouse_q1_skipped: q1.skipped,
    warehouse_q1_error: q1.error,
  };

  const { verdict, reasons } = computeEdogVerdict(input);

  return {
    pending_pixel_events: status.pending_pixel_events,
    batch_exports: status.batch_exports,
    pipeline_pixel_configured: status.pipeline_pixel_configured,
    pipeline_messages_configured: status.pipeline_messages_configured,
    d1_pixel_events_24h: input.d1_pixel_events_24h,
    d1_messages_24h: input.d1_messages_24h,
    warehouse_q1_ok: !q1.skipped && !q1.error && (q1.rowCount ?? 0) > 0,
    warehouse_q1_row_count: q1.rowCount,
    warehouse_q1_skipped: q1.skipped,
    warehouse_q1_error: q1.error,
    checked_at: new Date(nowMs).toISOString(),
    edog_verdict: verdict,
    reasons,
  };
}
