import { describe, expect, it } from 'vitest';
import {
  daysBetweenInclusive,
  gaqlSegmentsDateBetween,
  resolveAdsDateWindow,
} from './ads-date-window';

describe('resolveAdsDateWindow', () => {
  it('uses explicit BETWEEN bounds', () => {
    const w = resolveAdsDateWindow({ startDate: '2026-09-20', endDate: '2026-10-26' });
    expect(w).toEqual({
      startDate: '2026-09-20',
      endDate: '2026-10-26',
      days: 37,
    });
    expect(gaqlSegmentsDateBetween(w.startDate, w.endDate)).toBe(
      "segments.date BETWEEN '2026-09-20' AND '2026-10-26'",
    );
  });

  it('maps days into a BETWEEN window ending today UTC', () => {
    const w = resolveAdsDateWindow({ days: 14 });
    expect(w.days).toBe(14);
    expect(w.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(w.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(daysBetweenInclusive(w.startDate, w.endDate)).toBe(14);
  });
});
