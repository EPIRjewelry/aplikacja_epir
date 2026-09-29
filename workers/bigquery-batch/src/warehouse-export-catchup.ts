/**
 * Automatyczne opróżnianie backlogu pixel przed raportem (bez akcji operatora).
 */

import { epirDebugLog } from './epir-debug-log';
import {
  classifyWarehouseCatchUpBlockage,
  type ClassifyCatchUpResult,
} from './warehouse-catchup-blockage';

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
export const CATCHUP_ROWS_PER_RUN = 2500;

export async function runWarehouseExportCatchUp(
  runExport: ExportRunner,
  opts?: { maxRuns?: number; targetPending?: number },
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
  let runs = 0;
  let lastPending = -1;
  let pipelineError: string | undefined;
  let lastSummary: WarehouseExportSummaryLite | null = null;

  while (runs < maxRuns) {
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
          rowsPerRun: CATCHUP_ROWS_PER_RUN,
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
