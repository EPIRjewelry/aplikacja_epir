import { describe, expect, it } from 'vitest';
import { deriveInsights } from './insights';
import { resolveAnalysisPeriod } from './period';
import type { StoreSignal } from '@epir/steward-contract';

describe('resolveAnalysisPeriod', () => {
  it('returns ISO date range', () => {
    const p = resolveAnalysisPeriod(7, new Date('2026-05-25T12:00:00Z'));
    expect(p.period_end).toBe('2026-05-25');
    expect(p.period_start).toBe('2026-05-18');
    expect(p.cutoff_ms).toBeLessThan(Date.parse('2026-05-25T12:00:00Z'));
  });
});

describe('deriveInsights', () => {
  it('flags low ATC rate with BRAK_INFO or ROZMIAR', () => {
    const period = resolveAnalysisPeriod(7);
    const signals: StoreSignal[] = [
      {
        id: '1',
        period_start: period.period_start,
        period_end: period.period_end,
        signal_key: 'product_galazki',
        storefront_id: null,
        channel: null,
        product_handle: 'galazki',
        product_id: 'gid://shopify/Product/1',
        metric_name: 'view_to_atc_rate',
        metric_value: 0.02,
        metric_unit: 'ratio',
        evidence_json: JSON.stringify({ views: 100, atc: 2, avg_scroll: 70 }),
        source: 'd1_pixel',
      },
    ];
    const drafts = deriveInsights(period, signals);
    expect(drafts.some((d) => d.barrier === 'ROZMIAR' || d.barrier === 'BRAK_INFO')).toBe(true);
  });

  it('flags high checkout abandon', () => {
    const period = resolveAnalysisPeriod(7);
    const signals: StoreSignal[] = [
      {
        id: '2',
        period_start: period.period_start,
        period_end: period.period_end,
        signal_key: 'checkout_global',
        storefront_id: null,
        channel: null,
        product_handle: null,
        product_id: null,
        metric_name: 'checkout_abandon_rate',
        metric_value: 0.8,
        metric_unit: 'ratio',
        evidence_json: null,
        source: 'd1_pixel',
      },
    ];
    const drafts = deriveInsights(period, signals);
    expect(drafts.some((d) => d.barrier === 'CZAS')).toBe(true);
  });
});
