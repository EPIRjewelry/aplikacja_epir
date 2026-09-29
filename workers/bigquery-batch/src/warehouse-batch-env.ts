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
