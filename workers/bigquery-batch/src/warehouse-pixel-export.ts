import {
  pixelExportCursorWhereSql,
  pixelExportOrderBySql,
  rowExportCursorMsId,
} from './d1-timestamps';
import { isPipelineExportExtendedFields } from './pipeline-export-config';
import { mapOrderAttributionToPipelineRecord } from './order-pipeline-record';
import { mapPixelRowToPipelineRecord } from './pixel-pipeline-record';
import { postPipelineIngestBatch } from './pipeline-ingest';

export type ExportWatermark = {
  last_pixel_export_at: number;
  last_pixel_export_id: string;
  last_messages_export_at: number;
  last_orders_export_at: number;
  last_orders_export_id: string;
};

export const DEFAULT_WATERMARK: ExportWatermark = {
  last_pixel_export_at: 0,
  last_pixel_export_id: '',
  last_messages_export_at: 0,
  last_orders_export_at: 0,
  last_orders_export_id: '',
};

/** Wynik odczytu watermarka — przy `read_error` nie wolno robić persist (nadpisanie zerami). */
export type WatermarkLoadStatus = 'ok' | 'missing' | 'read_error';

export type WatermarkLoadResult = {
  status: WatermarkLoadStatus;
  watermark: ExportWatermark;
};

type ExportEnv = {
  DB: D1Database;
  DB_CHATBOT: D1Database;
  PIPELINE_PIXEL_INGEST_URL?: string;
  PIPELINE_MESSAGES_INGEST_URL?: string;
  PIPELINE_EXPORT_EXTENDED_FIELDS?: string;
};

const BATCH_SIZE = 100;

function rowToWatermark(row: ExportWatermark): ExportWatermark {
  return {
    last_pixel_export_at: row.last_pixel_export_at ?? 0,
    last_pixel_export_id: row.last_pixel_export_id ?? '',
    last_messages_export_at: row.last_messages_export_at ?? 0,
    last_orders_export_at: row.last_orders_export_at ?? 0,
    last_orders_export_id: row.last_orders_export_id ?? '',
  };
}

export async function loadExportWatermarkResult(db: D1Database): Promise<WatermarkLoadResult> {
  try {
    const row = await db
      .prepare(
        `SELECT last_pixel_export_at, last_pixel_export_id, last_messages_export_at,
                last_orders_export_at, last_orders_export_id
         FROM batch_exports WHERE id = 1`,
      )
      .first<ExportWatermark>();
    if (!row) return { status: 'missing', watermark: { ...DEFAULT_WATERMARK } };
    return { status: 'ok', watermark: rowToWatermark(row) };
  } catch {
    try {
      const row = await db
        .prepare('SELECT last_pixel_export_at, last_messages_export_at FROM batch_exports WHERE id = 1')
        .first<{ last_pixel_export_at: number; last_messages_export_at: number }>();
      if (!row) return { status: 'missing', watermark: { ...DEFAULT_WATERMARK } };
      return {
        status: 'ok',
        watermark: {
          ...DEFAULT_WATERMARK,
          last_pixel_export_at: row.last_pixel_export_at ?? 0,
          last_messages_export_at: row.last_messages_export_at ?? 0,
        },
      };
    } catch {
      return { status: 'read_error', watermark: { ...DEFAULT_WATERMARK } };
    }
  }
}

export async function loadExportWatermark(db: D1Database): Promise<ExportWatermark> {
  const r = await loadExportWatermarkResult(db);
  return r.watermark;
}

export async function exportPixelEvents(
  env: ExportEnv,
  wm: ExportWatermark,
  maxRows: number,
): Promise<{
  exported: number;
  cursor: Pick<ExportWatermark, 'last_pixel_export_at' | 'last_pixel_export_id'>;
  pipelineError?: string;
}> {
  const pipelineUrl = (env.PIPELINE_PIXEL_INGEST_URL ?? '').trim();
  if (!pipelineUrl) {
    return {
      exported: 0,
      cursor: { last_pixel_export_at: wm.last_pixel_export_at, last_pixel_export_id: wm.last_pixel_export_id },
    };
  }

  const extended = isPipelineExportExtendedFields(env);
  let cursorMs = wm.last_pixel_export_at;
  let cursorId = wm.last_pixel_export_id ?? '';
  let totalInserted = 0;

  try {
    while (totalInserted < maxRows) {
      const limit = Math.min(BATCH_SIZE, maxRows - totalInserted);
      const stmt = env.DB.prepare(
        `SELECT * FROM pixel_events WHERE ${pixelExportCursorWhereSql()}
         ORDER BY ${pixelExportOrderBySql()} LIMIT ?3`,
      ).bind(cursorMs, cursorId, limit);
      const result = await stmt.all<Record<string, unknown>>();
      const rows = result.results ?? [];
      if (rows.length === 0) break;

      const records = rows.map((r) => mapPixelRowToPipelineRecord(r, extended));
      const pr = await postPipelineIngestBatch(pipelineUrl, undefined, records);
      if (!pr.ok) {
        return {
          exported: totalInserted,
          cursor: { last_pixel_export_at: cursorMs, last_pixel_export_id: cursorId },
          pipelineError: `pixel ingest HTTP ${pr.status}: ${pr.body.slice(0, 120)}`,
        };
      }

      totalInserted += rows.length;
      const last = rows[rows.length - 1]!;
      const c = rowExportCursorMsId(last);
      cursorMs = c.ms;
      cursorId = c.id;
    }

    return {
      exported: totalInserted,
      cursor: { last_pixel_export_at: cursorMs, last_pixel_export_id: cursorId },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      exported: totalInserted,
      cursor: { last_pixel_export_at: cursorMs, last_pixel_export_id: cursorId },
      pipelineError: `pixel export: ${msg}`,
    };
  }
}

export async function exportOrderAttributions(
  env: ExportEnv,
  wm: ExportWatermark,
  maxRows: number,
): Promise<{
  exported: number;
  cursor: Pick<ExportWatermark, 'last_orders_export_at' | 'last_orders_export_id'>;
  pipelineError?: string;
}> {
  if (!isPipelineExportExtendedFields(env)) {
    return {
      exported: 0,
      cursor: {
        last_orders_export_at: wm.last_orders_export_at,
        last_orders_export_id: wm.last_orders_export_id,
      },
    };
  }

  const pipelineUrl = (env.PIPELINE_PIXEL_INGEST_URL ?? '').trim();
  if (!pipelineUrl) {
    return {
      exported: 0,
      cursor: {
        last_orders_export_at: wm.last_orders_export_at,
        last_orders_export_id: wm.last_orders_export_id,
      },
    };
  }

  let cursorMs = wm.last_orders_export_at;
  let cursorId = wm.last_orders_export_id ?? '';
  let totalInserted = 0;

  try {
    while (totalInserted < maxRows) {
      const limit = Math.min(BATCH_SIZE, maxRows - totalInserted);
      const stmt = env.DB.prepare(
        `SELECT * FROM order_attributions
         WHERE received_at > ?1 OR (received_at = ?1 AND shopify_order_gid > ?2)
         ORDER BY received_at ASC, shopify_order_gid ASC LIMIT ?3`,
      ).bind(cursorMs, cursorId, limit);
      const result = await stmt.all<Record<string, unknown>>();
      const rows = result.results ?? [];
      if (rows.length === 0) break;

      const records = [];
      for (const r of rows) {
        const rec = mapOrderAttributionToPipelineRecord(r);
        if (rec) records.push(rec);
        else console.warn('[WAREHOUSE_BATCH] skip order_attributions row without epir_session_id', r.shopify_order_gid);
      }
      if (records.length === 0) {
        const last = rows[rows.length - 1]!;
        cursorMs = Number(last.received_at) || cursorMs;
        cursorId = String(last.shopify_order_gid ?? cursorId);
        continue;
      }

      const pr = await postPipelineIngestBatch(pipelineUrl, undefined, records);
      if (!pr.ok) {
        return {
          exported: totalInserted,
          cursor: { last_orders_export_at: cursorMs, last_orders_export_id: cursorId },
          pipelineError: `order ingest HTTP ${pr.status}: ${pr.body.slice(0, 120)}`,
        };
      }

      totalInserted += records.length;
      const last = rows[rows.length - 1]!;
      cursorMs = Number(last.received_at) || cursorMs;
      cursorId = String(last.shopify_order_gid ?? cursorId);
    }

    return {
      exported: totalInserted,
      cursor: { last_orders_export_at: cursorMs, last_orders_export_id: cursorId },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      exported: totalInserted,
      cursor: { last_orders_export_at: cursorMs, last_orders_export_id: cursorId },
      pipelineError: `order export: ${msg}`,
    };
  }
}

export async function exportMessages(
  env: ExportEnv,
  wm: ExportWatermark,
  maxRows: number,
): Promise<{
  exported: number;
  cursor: Pick<ExportWatermark, 'last_messages_export_at'>;
  pipelineError?: string;
}> {
  const pipelineUrl = (env.PIPELINE_MESSAGES_INGEST_URL ?? '').trim();
  if (!pipelineUrl) {
    return { exported: 0, cursor: { last_messages_export_at: wm.last_messages_export_at } };
  }

  let cursorTs = wm.last_messages_export_at;
  let cursorId = 0;
  let totalInserted = 0;

  try {
    while (totalInserted < maxRows) {
      const limit = Math.min(BATCH_SIZE, maxRows - totalInserted);
      const stmt = env.DB_CHATBOT.prepare(
        `SELECT * FROM messages
         WHERE timestamp > ?1 OR (timestamp = ?1 AND CAST(id AS INTEGER) > ?2)
         ORDER BY timestamp ASC, id ASC LIMIT ?3`,
      ).bind(cursorTs, cursorId, limit);
      const result = await stmt.all<Record<string, unknown>>();
      const rows = result.results ?? [];
      if (rows.length === 0) break;

      const records = rows.map((r) => ({
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
        return {
          exported: totalInserted,
          cursor: { last_messages_export_at: cursorTs },
          pipelineError: `messages ingest HTTP ${pr.status}: ${pr.body.slice(0, 120)}`,
        };
      }

      totalInserted += rows.length;
      const last = rows[rows.length - 1]!;
      cursorTs = (last.timestamp as number) ?? cursorTs;
      cursorId = Number(last.id) || cursorId;
    }

    return { exported: totalInserted, cursor: { last_messages_export_at: cursorTs } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      exported: totalInserted,
      cursor: { last_messages_export_at: cursorTs },
      pipelineError: `messages export: ${msg}`,
    };
  }
}

export async function persistExportWatermark(
  db: D1Database,
  wm: ExportWatermark,
  now: number,
): Promise<void> {
  try {
    await db
      .prepare(
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
    await db
      .prepare(
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

/** Liczba wierszy pixel jeszcze za watermarkiem (przybliżenie pending). */
export async function countPendingPixel(
  db: D1Database,
  wm: Pick<ExportWatermark, 'last_pixel_export_at' | 'last_pixel_export_id'>,
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS cnt FROM pixel_events WHERE ${pixelExportCursorWhereSql()}`)
    .bind(wm.last_pixel_export_at, wm.last_pixel_export_id ?? '')
    .first<{ cnt: number }>();
  return row?.cnt ?? -1;
}
