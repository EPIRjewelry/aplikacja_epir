/** Parsowanie flag operacyjnych batcha (bez sekretów). */

export function isHistoricalTriageEnabled(env: {
  WAREHOUSE_PIXEL_HISTORY_TRIAGE_ENABLED?: string;
}): boolean {
  const v = (env.WAREHOUSE_PIXEL_HISTORY_TRIAGE_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function triageKeepDays(env: { WAREHOUSE_PIXEL_TRIAGE_KEEP_DAYS?: string }): number {
  const n = Number((env.WAREHOUSE_PIXEL_TRIAGE_KEEP_DAYS ?? '7').trim());
  if (!Number.isFinite(n) || n <= 0) return 7;
  return Math.min(Math.floor(n), 365);
}

export function resolveCatchupMaxRuns(env: { WAREHOUSE_CATCHUP_MAX_RUNS?: string }): number {
  const n = Number((env.WAREHOUSE_CATCHUP_MAX_RUNS ?? '12').trim());
  if (!Number.isFinite(n) || n < 1) return 12;
  return Math.min(Math.floor(n), 96);
}

/** Jedna paczka odczytu D1 + ingest + zapis kursora. Było 100 wewnątrz przebiegu 2500. */
export const DEFAULT_PIXEL_EXPORT_BATCH_SIZE = 500;
/** Wiersze pixela na jedno wywołanie handleScheduled. Było 2500 — dobijało D1. */
export const DEFAULT_PIXEL_EXPORT_MAX_ROWS_PER_RUN = 500;
/** Pauza między paczkami (ms), także między przebiegami catch-upu. */
export const DEFAULT_PIXEL_EXPORT_BATCH_PAUSE_MS = 200;
/** Pierwsza próba + retry. Przeciążenie D1 zwykle puszcza przy 2.–3. próbie. */
export const DEFAULT_PIXEL_EXPORT_D1_MAX_ATTEMPTS = 4;
/** Bazowe opóźnienie przed pierwszym retry odczytu/zapisu paczki pixela (ms). */
export const DEFAULT_PIXEL_EXPORT_D1_BASE_DELAY_MS = 400;

function parseClampedInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function resolvePixelExportBatchSize(env: {
  WAREHOUSE_PIXEL_EXPORT_BATCH_SIZE?: string;
}): number {
  return parseClampedInt(
    env.WAREHOUSE_PIXEL_EXPORT_BATCH_SIZE,
    DEFAULT_PIXEL_EXPORT_BATCH_SIZE,
    1,
    2000,
  );
}

export function resolvePixelExportMaxRows(env: { WAREHOUSE_PIXEL_EXPORT_MAX_ROWS?: string }): number {
  return parseClampedInt(
    env.WAREHOUSE_PIXEL_EXPORT_MAX_ROWS,
    DEFAULT_PIXEL_EXPORT_MAX_ROWS_PER_RUN,
    1,
    10_000,
  );
}

export function resolvePixelExportBatchPauseMs(env: {
  WAREHOUSE_PIXEL_EXPORT_BATCH_PAUSE_MS?: string;
}): number {
  return parseClampedInt(
    env.WAREHOUSE_PIXEL_EXPORT_BATCH_PAUSE_MS,
    DEFAULT_PIXEL_EXPORT_BATCH_PAUSE_MS,
    0,
    10_000,
  );
}

export function resolvePixelExportD1MaxAttempts(env: {
  WAREHOUSE_PIXEL_EXPORT_D1_MAX_ATTEMPTS?: string;
}): number {
  return parseClampedInt(
    env.WAREHOUSE_PIXEL_EXPORT_D1_MAX_ATTEMPTS,
    DEFAULT_PIXEL_EXPORT_D1_MAX_ATTEMPTS,
    1,
    8,
  );
}

export function resolvePixelExportD1BaseDelayMs(env: {
  WAREHOUSE_PIXEL_EXPORT_D1_BASE_DELAY_MS?: string;
}): number {
  return parseClampedInt(
    env.WAREHOUSE_PIXEL_EXPORT_D1_BASE_DELAY_MS,
    DEFAULT_PIXEL_EXPORT_D1_BASE_DELAY_MS,
    0,
    10_000,
  );
}
