/**
 * Forward skip historycznego backlogu pixel (bez ingestu) — przywraca pending poniżej progu EDOG.
 */

import {
  PIXEL_CREATED_AT_MS_SQL,
  PIXEL_ID_TEXT_SQL,
  pixelExportCursorWhereSql,
  pixelExportOrderBySql,
  rowExportCursorMsId,
} from './d1-timestamps';
import { classifyWarehouseCatchUpBlockage } from './warehouse-catchup-blockage';
import { TARGET_PENDING, CATCHUP_ROWS_PER_RUN, MAX_CATCHUP_RUNS } from './warehouse-export-catchup';
import { isHistoricalTriageEnabled, triageKeepDays } from './warehouse-batch-env';
import {
  countPendingPixel,
  persistExportWatermark,
  type ExportWatermark,
  type WatermarkLoadResult,
} from './warehouse-pixel-export';

export const EDOG_PENDING_FAIL = 10_000;

export type PixelExportCursor = { ms: number; id: string };

export type HistoricalTriageResult = {
  applied: boolean;
  reason?: string;
  old_ms?: number;
  old_id?: string;
  new_ms?: number;
  new_id?: string;
  cutoff_ms?: number;
  keep_days?: number;
  pending_before?: number;
  skipped_estimate?: number;
  pending_after?: number;
};

export function isCursorStrictlyAfter(a: PixelExportCursor, b: PixelExportCursor): boolean {
  if (a.ms > b.ms) return true;
  if (a.ms < b.ms) return false;
  return a.id > b.id;
}

/** Ostatni wiersz ze `created_at` (ms) &lt; cutoffMs w kolejności eksportu. */
export async function seekPixelWatermarkBeforeCutoff(
  db: D1Database,
  cutoffMs: number,
): Promise<PixelExportCursor | null> {
  const orderDesc = pixelExportOrderBySql().replace(/ ASC/gi, ' DESC');
  const row = await db
    .prepare(
      `SELECT * FROM pixel_events
       WHERE (${PIXEL_CREATED_AT_MS_SQL}) < ?1
       ORDER BY ${orderDesc}
       LIMIT 1`,
    )
    .bind(cutoffMs)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return rowExportCursorMsId(row);
}

/** Wiersze między starym kursorem (wyłącznie) a nowym (włącznie) — szacunek pominiętych bez ingestu. */
export async function estimateSkippedBetween(
  db: D1Database,
  oldCursor: PixelExportCursor,
  newCursor: PixelExportCursor,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM pixel_events
       WHERE ${pixelExportCursorWhereSql()}
         AND (
           (${PIXEL_CREATED_AT_MS_SQL}) < ?3
           OR ((${PIXEL_CREATED_AT_MS_SQL}) = ?3 AND ${PIXEL_ID_TEXT_SQL} <= ?4)
         )`,
    )
    .bind(oldCursor.ms, oldCursor.id, newCursor.ms, newCursor.id)
    .first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

export type TriageEnv = {
  DB: D1Database;
  PIPELINE_PIXEL_INGEST_URL?: string;
  WAREHOUSE_PIXEL_HISTORY_TRIAGE_ENABLED?: string;
  WAREHOUSE_PIXEL_TRIAGE_KEEP_DAYS?: string;
  WAREHOUSE_CATCHUP_MAX_RUNS?: string;
};

export async function applyHistoricalBacklogTriage(
  env: TriageEnv,
  wmLoad: WatermarkLoadResult,
  pendingBefore: number,
  opts?: { nowMs?: number; maxRuns?: number },
): Promise<HistoricalTriageResult> {
  if (wmLoad.status !== 'ok') {
    return { applied: false, reason: `watermark_load_${wmLoad.status}` };
  }
  if (!(env.PIPELINE_PIXEL_INGEST_URL ?? '').trim()) {
    return { applied: false, reason: 'pipeline_not_configured' };
  }
  if (!isHistoricalTriageEnabled(env)) {
    return { applied: false, reason: 'triage_disabled' };
  }
  if (pendingBefore < 0) {
    return { applied: false, reason: 'pending_unknown' };
  }

  const wm = wmLoad.watermark;
  const oldCursor: PixelExportCursor = {
    ms: wm.last_pixel_export_at,
    id: wm.last_pixel_export_id ?? '',
  };

  const maxRuns = opts?.maxRuns ?? MAX_CATCHUP_RUNS;
  const diag = classifyWarehouseCatchUpBlockage({
    pendingBefore,
    last_pixel_export_at: oldCursor.ms,
    last_pixel_export_id: oldCursor.id,
    pipelineConfigured: true,
    maxRuns,
    rowsPerRun: CATCHUP_ROWS_PER_RUN,
    nowMs: opts?.nowMs,
  });

  if (diag.blockage !== 'watermark_reset' || pendingBefore <= TARGET_PENDING) {
    return { applied: false, reason: `blockage_${diag.blockage}` };
  }

  const nowMs = opts?.nowMs ?? Date.now();
  const keepDays = triageKeepDays(env);
  const cutoffMs = nowMs - keepDays * 86_400_000;

  const newCursor = await seekPixelWatermarkBeforeCutoff(env.DB, cutoffMs);
  if (!newCursor || newCursor.ms <= 0) {
    return { applied: false, reason: 'no_row_before_cutoff' };
  }
  if (!isCursorStrictlyAfter(newCursor, oldCursor)) {
    return { applied: false, reason: 'new_cursor_not_forward' };
  }

  const skippedEstimate = await estimateSkippedBetween(env.DB, oldCursor, newCursor);

  const nextWm: ExportWatermark = {
    ...wm,
    last_pixel_export_at: newCursor.ms,
    last_pixel_export_id: newCursor.id,
  };
  await persistExportWatermark(env.DB, nextWm, nowMs);

  const pendingAfter = await countPendingPixel(env.DB, nextWm);

  const result: HistoricalTriageResult = {
    applied: true,
    old_ms: oldCursor.ms,
    old_id: oldCursor.id,
    new_ms: newCursor.ms,
    new_id: newCursor.id,
    cutoff_ms: cutoffMs,
    keep_days: keepDays,
    pending_before: pendingBefore,
    skipped_estimate: skippedEstimate,
    pending_after: pendingAfter,
  };

  console.log(
    '[WAREHOUSE_BATCH] watermark_history_triage',
    JSON.stringify({
      ...result,
      blockage: diag.blockage,
    }),
  );

  return result;
}

/** Czy po catch-up uruchomić triage (flaga + pending / klasyfikacja). */
export function shouldAttemptHistoricalTriage(
  env: TriageEnv,
  pendingAfterCatchUp: number,
  blockage: string | undefined,
): boolean {
  if (!isHistoricalTriageEnabled(env)) return false;
  if (pendingAfterCatchUp < 0) return false;
  if (blockage === 'watermark_reset') return true;
  return pendingAfterCatchUp >= EDOG_PENDING_FAIL;
}
