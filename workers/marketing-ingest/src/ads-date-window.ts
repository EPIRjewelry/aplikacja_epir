/**
 * Google Ads GAQL: DURING LAST_N_DAYS only accepts fixed literals (7/14/30…).
 * Arbitrary N (e.g. 37) fails with INVALID_VALUE_WITH_DURING_OPERATOR.
 * Prefer segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'.
 */

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function clampDays(days: number | undefined, fallback = 14): number {
  const n = Number.isFinite(days) ? Math.floor(days as number) : fallback;
  return Math.min(90, Math.max(1, n));
}

function utcYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysBetweenInclusive(startDate: string, endDate: string): number {
  const a = Date.parse(`${startDate}T00:00:00Z`);
  const b = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 14;
  return Math.min(90, Math.floor((b - a) / 86400000) + 1);
}

export type AdsDateWindow = {
  startDate: string;
  endDate: string;
  days: number;
};

/**
 * Resolve an Ads reporting window. Prefer explicit startDate/endDate;
 * otherwise map `days` ending today (UTC) into BETWEEN bounds.
 */
export function resolveAdsDateWindow(opts?: {
  days?: number;
  startDate?: string;
  endDate?: string;
}): AdsDateWindow {
  const startIn = opts?.startDate?.trim() ?? '';
  const endIn = opts?.endDate?.trim() ?? '';
  if (isIsoDate(startIn) && isIsoDate(endIn) && endIn >= startIn) {
    return {
      startDate: startIn,
      endDate: endIn,
      days: daysBetweenInclusive(startIn, endIn),
    };
  }
  const days = clampDays(opts?.days);
  const end = new Date();
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    startDate: utcYmd(start),
    endDate: utcYmd(end),
    days,
  };
}

export function gaqlSegmentsDateBetween(startDate: string, endDate: string): string {
  return `segments.date BETWEEN '${startDate}' AND '${endDate}'`;
}
