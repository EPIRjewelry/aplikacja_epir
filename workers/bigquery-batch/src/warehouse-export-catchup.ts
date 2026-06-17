/**
 * Automatyczne opróżnianie backlogu pixel przed raportem (bez akcji operatora).
 */

export type WarehouseExportSummaryLite = {
  pixelExported: number;
  messagesExported: number;
  pending_pixel_after: number;
  pipeline_error?: string;
};

export type ExportRunner = () => Promise<WarehouseExportSummaryLite | null>;

const MAX_CATCHUP_RUNS = 12;
const TARGET_PENDING = 1000;

export async function runWarehouseExportCatchUp(
  runExport: ExportRunner,
  opts?: { maxRuns?: number; targetPending?: number },
): Promise<{ runs: number; lastPending: number; pipelineError?: string }> {
  const maxRuns = opts?.maxRuns ?? MAX_CATCHUP_RUNS;
  const target = opts?.targetPending ?? TARGET_PENDING;
  let runs = 0;
  let lastPending = -1;
  let pipelineError: string | undefined;

  while (runs < maxRuns) {
    const summary = await runExport();
    runs++;
    if (!summary) {
      pipelineError = 'export_skipped_no_pipeline';
      break;
    }
    lastPending = summary.pending_pixel_after;
    if (summary.pipeline_error) pipelineError = summary.pipeline_error;
    if (lastPending >= 0 && lastPending < target) break;
    if (summary.pipeline_error) break;
    if (summary.pixelExported === 0 && summary.messagesExported === 0) break;
  }

  return { runs, lastPending, pipelineError };
}
