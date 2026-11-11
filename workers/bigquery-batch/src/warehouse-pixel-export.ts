import { isTransientD1Error, withD1Retry } from './d1-retry';
import {
  pixelExportSelectSql,
  pixelPendingCountSql,
  rowExportCursorMsId,
} from './d1-timestamps';
import { gemmaCustomerMessagesSql } from './gemma-channel-filter';
import { isPipelineExportExtendedFields } from './pipeline-export-config';
import { mapOrderAttributionToPipelineRecord } from './order-pipeline-record';
import { mapPixelRowToPipelineRecord } from './pixel-pipeline-record';
import { postPipelineIngestBatch } from './pipeline-ingest';
import {
  DEFAULT_PIXEL_EXPORT_BATCH_SIZE,
  DEFAULT_PIXEL_EXPORT_D1_BASE_DELAY_MS,
  DEFAULT_PIXEL_EXPORT_D1_MAX_ATTEMPTS,
} from './warehouse-batch-env';

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

/** Chunk HTTP ingest dla messages / order_attributions. Pixel ma własny batch (domyślnie 500). */
const NON_PIXEL_CHUNK_SIZE = 100;

export type PixelExportBatchResult =
  | 'ok'
  | 'empty'
  | 'd1_error'
  | 'pipeline_error'
  | 'cursor_persist_error'
  | 'cursor_stall';

export type PixelExportOptions = {
  /** Wiersze jednego odczytu D1 + jednego POST ingest. Domyślnie 500. */
  batchSize?: number;
  /** Pauza po pełnej paczce, zanim poleci następny odczyt. 0 w testach. */
  pauseMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

const PIXEL_CURSOR_UPSERT_SQL = `INSERT INTO batch_exports (id, last_pixel_export_at, last_pixel_export_id, updated_at)
VALUES (1, ?1, ?2, ?3)
ON CONFLICT(id) DO UPDATE SET
  last_pixel_export_at = excluded.last_pixel_export_at,
  last_pixel_export_id = excluded.last_pixel_export_id,
  updated_at = excluded.updated_at`;

const PIXEL_CURSOR_UPSERT_LEGACY_SQL = `INSERT INTO batch_exports (id, last_pixel_export_at, updated_at)
VALUES (1, ?1, ?2)
ON CONFLICT(id) DO UPDATE SET
  last_pixel_export_at = excluded.last_pixel_export_at,
  updated_at = excluded.updated_at`;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Jedna linia na paczkę: rozmiar, czas, próby, wynik. Bez identyfikatorów i treści zdarzeń. */
function logPixelExportBatch(fields: {
  rows: number;
  durationMs: number;
  attempts: number;
  result: PixelExportBatchResult;
}): void {
  console.log(
    JSON.stringify({
      tag: 'pixel_export_batch',
      rows: fields.rows,
      durationMs: fields.durationMs,
      attempts: fields.attempts,
      result: fields.result,
    }),
  );
}

function cursorStrictlyAfter(next: { ms: number; id: string }, prevMs: number, prevId: string): boolean {
  if (next.ms > prevMs) return true;
  if (next.ms < prevMs) return false;
  return next.id > prevId;
}

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
    const row = await withD1Retry(
      () =>
        db
          .prepare(
            `SELECT last_pixel_export_at, last_pixel_export_id, last_messages_export_at,
                last_orders_export_at, last_orders_export_id
         FROM batch_exports WHERE id = 1`,
          )
          .first<ExportWatermark>(),
      { step: 'load_export_watermark' },
    );
    if (!row) return { status: 'missing', watermark: { ...DEFAULT_WATERMARK } };
    return { status: 'ok', watermark: rowToWatermark(row) };
  } catch (error) {
    if (isTransientD1Error(error)) {
      return { status: 'read_error', watermark: { ...DEFAULT_WATERMARK } };
    }
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
  opts?: PixelExportOptions,
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
  const batchSize = Math.min(
    2000,
    Math.max(1, Math.floor(opts?.batchSize ?? DEFAULT_PIXEL_EXPORT_BATCH_SIZE)),
  );
  const pauseMs = Math.max(0, opts?.pauseMs ?? 0);
  const sleep = opts?.sleep ?? defaultSleep;
  const random = opts?.random ?? Math.random;
  const now = opts?.now ?? Date.now;
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_PIXEL_EXPORT_D1_MAX_ATTEMPTS;
  const baseDelayMs = opts?.baseDelayMs ?? DEFAULT_PIXEL_EXPORT_D1_BASE_DELAY_MS;
  const retryBase = { maxAttempts, baseDelayMs, sleep, random, log: false as const };

  let cursorMs = wm.last_pixel_export_at;
  let cursorId = wm.last_pixel_export_id ?? '';
  let totalInserted = 0;

  const committed = () => ({
    exported: totalInserted,
    cursor: { last_pixel_export_at: cursorMs, last_pixel_export_id: cursorId },
  });

  try {
    while (totalInserted < maxRows) {
      const limit = Math.min(batchSize, maxRows - totalInserted);
      const started = Date.now();
      const readStats = { attempts: 0 };
      let rows: Record<string, unknown>[] = [];
      try {
        const result = await withD1Retry(
          () =>
            env.DB.prepare(pixelExportSelectSql())
              .bind(cursorMs, cursorId, limit)
              .all<Record<string, unknown>>(),
          { ...retryBase, step: 'pixel_export_read', stats: readStats },
        );
        rows = result.results ?? [];
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logPixelExportBatch({
          rows: 0,
          durationMs: Date.now() - started,
          attempts: readStats.attempts,
          result: 'd1_error',
        });
        return { ...committed(), pipelineError: `pixel export: ${msg}` };
      }

      if (rows.length === 0) {
        logPixelExportBatch({
          rows: 0,
          durationMs: Date.now() - started,
          attempts: readStats.attempts,
          result: 'empty',
        });
        break;
      }

      const records = rows.map((r) => mapPixelRowToPipelineRecord(r, extended));
      const pr = await postPipelineIngestBatch(pipelineUrl, undefined, records);
      if (!pr.ok) {
        logPixelExportBatch({
          rows: rows.length,
          durationMs: Date.now() - started,
          attempts: readStats.attempts,
          result: 'pipeline_error',
        });
        return {
          ...committed(),
          pipelineError: `pixel ingest HTTP ${pr.status}: ${pr.body.slice(0, 120)}`,
        };
      }

      const next = rowExportCursorMsId(rows[rows.length - 1]!);
      if (!cursorStrictlyAfter(next, cursorMs, cursorId)) {
        logPixelExportBatch({
          rows: rows.length,
          durationMs: Date.now() - started,
          attempts: readStats.attempts,
          result: 'cursor_stall',
        });
        return { ...committed(), pipelineError: 'pixel export: cursor did not advance' };
      }

      const persistStats = { attempts: 0 };
      try {
        await withD1Retry(
          () =>
            persistPixelExportCursor(
              env.DB,
              { last_pixel_export_at: next.ms, last_pixel_export_id: next.id },
              now(),
            ),
          { ...retryBase, step: 'pixel_export_cursor', stats: persistStats },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logPixelExportBatch({
          rows: rows.length,
          durationMs: Date.now() - started,
          attempts: Math.max(readStats.attempts, persistStats.attempts),
          result: 'cursor_persist_error',
        });
        return {
          ...committed(),
          pipelineError: `pixel export: cursor persist failed: ${msg}`,
        };
      }

      cursorMs = next.ms;
      cursorId = next.id;
      totalInserted += rows.length;
      logPixelExportBatch({
        rows: rows.length,
        durationMs: Date.now() - started,
        attempts: Math.max(readStats.attempts, persistStats.attempts),
        result: 'ok',
      });

      const more = rows.length === limit && totalInserted < maxRows;
      if (more && pauseMs > 0) await sleep(pauseMs);
    }

    return committed();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ...committed(), pipelineError: `pixel export: ${msg}` };
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
      const limit = Math.min(NON_PIXEL_CHUNK_SIZE, maxRows - totalInserted);
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
      const limit = Math.min(NON_PIXEL_CHUNK_SIZE, maxRows - totalInserted);
      const stmt = env.DB_CHATBOT.prepare(
        `SELECT m.* FROM messages m WHERE (m.timestamp > ?1 OR (m.timestamp = ?1 AND CAST(m.id AS INTEGER) > ?2)) AND ${gemmaCustomerMessagesSql('m')} ORDER BY m.timestamp ASC, m.id ASC LIMIT ?3`,
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
  } catch (error) {
    if (isTransientD1Error(error)) throw error;
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

/**
 * Zapis wyłącznie kursora pixela. Nie rusza kursorów messages/orders.
 * Rzuca przy błędzie przejściowym — wołający retryuje, zamiast iść w fallback schematu.
 */
export async function persistPixelExportCursor(
  db: D1Database,
  cursor: Pick<ExportWatermark, 'last_pixel_export_at' | 'last_pixel_export_id'>,
  now: number,
): Promise<void> {
  try {
    await db
      .prepare(PIXEL_CURSOR_UPSERT_SQL)
      .bind(cursor.last_pixel_export_at, cursor.last_pixel_export_id ?? '', now)
      .run();
  } catch (error) {
    if (isTransientD1Error(error)) throw error;
    await db.prepare(PIXEL_CURSOR_UPSERT_LEGACY_SQL).bind(cursor.last_pixel_export_at, now).run();
  }
}

/**
 * Liczba wierszy pixel jeszcze za watermarkiem.
 * Bez retry: dopóki nie ma `idx_pixel_export_cursor`, to pełny skan — ponawianie go
 * w pętli tylko dokłada obciążenia. Przejściowy błąd łapie wołający (flow-health / cron).
 */
export async function countPendingPixel(
  db: D1Database,
  wm: Pick<ExportWatermark, 'last_pixel_export_at' | 'last_pixel_export_id'>,
): Promise<number> {
  const row = await db
    .prepare(pixelPendingCountSql())
    .bind(wm.last_pixel_export_at, wm.last_pixel_export_id ?? '')
    .first<{ cnt: number }>();
  return row?.cnt ?? -1;
}
