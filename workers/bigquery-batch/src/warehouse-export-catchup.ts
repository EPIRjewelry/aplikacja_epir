/**
 * Automatyczne opróżnianie backlogu pixel przed raportem (bez akcji operatora).
 */

import { epirDebugLog } from './epir-debug-log';
import {
  classifyWarehouseCatchUpBlockage,
  type ClassifyCatchUpResult,
} from './warehouse-catchup-blockage';
import { DEFAULT_PIXEL_EXPORT_MAX_ROWS_PER_RUN } from './warehouse-batch-env';

export type WarehouseExportSummaryLite = {
  pixelExported: number;
  messagesExported: number;
  pending_pixel_after: number;
  pipeline_error?: string;
  last_pixel_export_at?: number;
};

export type ExportRunner = () => Promise<WarehouseExportSummaryLite | null>;

export const MAX_CATCHUP_RUNS = 12;
export const TARGET_PENDING = 1000;
export const CATCHUP_ROWS_PER_RUN = DEFAULT_PIXEL_EXPORT_MAX_ROWS_PER_RUN;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWarehouseExportCatchUp(
  runExport: ExportRunner,
  opts?: {
    maxRuns?: number;
    targetPending?: number;
    /** Pauza przed kolejnym przebiegiem (nie przed pierwszym). 0 = brak. */
    pauseMs?: number;
    sleep?: (ms: number) => Promise<void>;
    /** Do symulacji pojemności w blockageDiag. Domyślnie paczka pixela (500). */
    rowsPerRun?: number;
  },
): Promise<{
  runs: number;
  lastPending: number;
  pipelineError?: string;
  lastSummary: WarehouseExportSummaryLite | null;
  /** Klasyfikacja po pętli (do logu Nightly catch-up partial). */
  blockageDiag: ClassifyCatchUpResult | null;
}> {
  const maxRuns = opts?.maxRuns ?? MAX_CATCHUP_RUNS;
  const target = opts?.targetPending ?? TARGET_PENDING;
  const pauseMs = Math.max(0, opts?.pauseMs ?? 0);
  const sleep = opts?.sleep ?? defaultSleep;
  const rowsPerRun = opts?.rowsPerRun ?? CATCHUP_ROWS_PER_RUN;
  let runs = 0;
  let lastPending = -1;
  let pipelineError: string | undefined;
  let lastSummary: WarehouseExportSummaryLite | null = null;

  while (runs < maxRuns) {
    if (runs > 0 && pauseMs > 0) await sleep(pauseMs);
    const summary = await runExport();
    runs++;
    if (!summary) {
      pipelineError = 'export_skipped_no_pipeline';
      break;
    }
    lastSummary = summary;
    lastPending = summary.pending_pixel_after;
    if (summary.pipeline_error) pipelineError = summary.pipeline_error;
    epirDebugLog(
      'warehouse-export-catchup.ts:loop',
      'catchup_run_done',
      {
        run: runs,
        maxRuns,
        target,
        pixelExported: summary.pixelExported,
        pendingAfter: summary.pending_pixel_after,
        pipelineError: summary.pipeline_error ?? null,
      },
      'H-B',
    );
    console.log('[WAREHOUSE_BATCH] catchup_run', {
      run: runs,
      pixelExported: summary.pixelExported,
      pendingAfter: summary.pending_pixel_after,
      pipelineError: summary.pipeline_error,
    });
    if (lastPending >= 0 && lastPending < target) break;
    if (summary.pipeline_error) break;
    if (summary.pixelExported === 0 && summary.messagesExported === 0) break;
  }

  const blockageDiag =
    lastPending < 0
      ? null
      : classifyWarehouseCatchUpBlockage({
          pendingBefore: lastPending,
          last_pixel_export_at: lastSummary?.last_pixel_export_at ?? 0,
          pipelineConfigured: pipelineError !== 'export_skipped_no_pipeline',
          maxRuns,
          rowsPerRun,
        });

  return { runs, lastPending, pipelineError, lastSummary, blockageDiag };
}

/**
 * Dry-run catch-upu: tylko klasyfikacja + log, bez ingestu i bez persist watermarka.
 */
export function dryRunWarehouseCatchUpClassify(input: {
  pendingBefore: number;
  last_pixel_export_at: number;
  last_pixel_export_id?: string | null;
  pipelineConfigured: boolean;
  totalPixelApprox?: number;
  nowMs?: number;
}): ClassifyCatchUpResult {
  const diag = classifyWarehouseCatchUpBlockage({
    ...input,
    maxRuns: MAX_CATCHUP_RUNS,
    rowsPerRun: CATCHUP_ROWS_PER_RUN,
  });
  console.log(diag.logLine);
  return diag;
}
