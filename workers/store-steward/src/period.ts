export interface AnalysisPeriod {
  period_start: string;
  period_end: string;
  cutoff_ms: number;
}

export function resolveAnalysisPeriod(lookbackDays: number, now = new Date()): AnalysisPeriod {
  const days = Math.max(1, Math.min(90, Math.floor(lookbackDays)));
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);
  const period_end = end.toISOString().slice(0, 10);
  const period_start = start.toISOString().slice(0, 10);
  const cutoff_ms = start.getTime();
  return { period_start, period_end, cutoff_ms };
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
