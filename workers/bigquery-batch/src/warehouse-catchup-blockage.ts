/**
 * Klasyfikacja blokady nocnego catch-upu (dry-run / diagnostyka) — bez I/O.
 */

export type CatchUpBlockage =
  | 'none'
  | 'pipeline'
  | 'watermark_reset'
  | 'catchup_limit';

export type ClassifyCatchUpInput = {
  pendingBefore: number;
  last_pixel_export_at: number;
  last_pixel_export_id?: string | null;
  pipelineConfigured: boolean;
  /** Opcjonalnie COUNT(*) pixel_events — gdy pending ≈ total, traktuj jako rewind. */
  totalPixelApprox?: number;
  nowMs?: number;
  maxRuns?: number;
  rowsPerRun?: number;
  criticalPending?: number;
  /** Kursor starszy niż to + pending krytyczny ⇒ watermark_reset (cofnięcie). */
  rewindStaleMs?: number;
};

export type ClassifyCatchUpResult = {
  blockage: CatchUpBlockage;
  catchupCapacity: number;
  simulatedPendingAfter: number;
  last_pixel_export_at: number;
  last_pixel_export_id: string;
  pendingBefore: number;
  /** Jedna linia do logu / konsoli. */
  logLine: string;
};

const DEFAULT_MAX_RUNS = 12;
const DEFAULT_ROWS_PER_RUN = 2500;
const DEFAULT_CRITICAL = 10_000;
/** 7 dni — backlog critical przy kursorze starszym niż tydzień = rewind, nie dzienny napływ. */
const DEFAULT_REWIND_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function classifyWarehouseCatchUpBlockage(input: ClassifyCatchUpInput): ClassifyCatchUpResult {
  const maxRuns = input.maxRuns ?? DEFAULT_MAX_RUNS;
  const rowsPerRun = input.rowsPerRun ?? DEFAULT_ROWS_PER_RUN;
  const criticalPending = input.criticalPending ?? DEFAULT_CRITICAL;
  const rewindStaleMs = input.rewindStaleMs ?? DEFAULT_REWIND_STALE_MS;
  const nowMs = input.nowMs ?? Date.now();
  const catchupCapacity = maxRuns * rowsPerRun;
  const pendingBefore = input.pendingBefore;
  const wmAt = Number(input.last_pixel_export_at) || 0;
  const wmId = String(input.last_pixel_export_id ?? '');

  const simulatedPendingAfter =
    pendingBefore < 0 ? -1 : Math.max(0, pendingBefore - catchupCapacity);

  let blockage: CatchUpBlockage = 'none';

  if (!input.pipelineConfigured) {
    blockage = 'pipeline';
  } else if (wmAt <= 0) {
    blockage = 'watermark_reset';
  } else if (
    input.totalPixelApprox != null &&
    input.totalPixelApprox > 0 &&
    pendingBefore >= 0 &&
    pendingBefore >= 0.85 * input.totalPixelApprox
  ) {
    blockage = 'watermark_reset';
  } else if (
    pendingBefore >= criticalPending &&
    pendingBefore > catchupCapacity &&
    nowMs - wmAt > rewindStaleMs
  ) {
    blockage = 'watermark_reset';
  } else if (pendingBefore > catchupCapacity) {
    blockage = 'catchup_limit';
  } else if (simulatedPendingAfter >= criticalPending) {
    blockage = 'catchup_limit';
  } else {
    blockage = 'none';
  }

  const logLine = [
    '[WAREHOUSE_BATCH] catchup_dry_run',
    `blockage=${blockage}`,
    `pendingBefore=${pendingBefore}`,
    `simulatedPendingAfter=${simulatedPendingAfter}`,
    `catchupCapacity=${catchupCapacity}`,
    `last_pixel_export_at=${wmAt}`,
    `last_pixel_export_id=${wmId || '(empty)'}`,
    `criticalPending=${criticalPending}`,
  ].join(' ');

  return {
    blockage,
    catchupCapacity,
    simulatedPendingAfter,
    last_pixel_export_at: wmAt,
    last_pixel_export_id: wmId,
    pendingBefore,
    logLine,
  };
}
