import { describe, expect, it } from 'vitest';
import { computeEdogVerdict, shouldProbeWarehouseQ1 } from './edog-flow-health';

const NOW = 1_700_000_000_000;

function base(overrides: Partial<Parameters<typeof computeEdogVerdict>[0]> = {}) {
  return {
    pending_pixel_events: 10,
    batch_exports_updated_at_ms: NOW - 12 * 3_600_000,
    now_ms: NOW,
    pipeline_pixel_configured: true,
    pipeline_messages_configured: true,
    d1_pixel_events_24h: 100,
    d1_messages_24h: 50,
    warehouse_q1_row_count: 3,
    warehouse_q1_skipped: false,
    ...overrides,
  };
}

describe('computeEdogVerdict', () => {
  it('returns PASS when metrics healthy', () => {
    const r = computeEdogVerdict(base());
    expect(r.verdict).toBe('PASS');
  });

  it('returns FAIL when pipeline not configured', () => {
    const r = computeEdogVerdict(base({ pipeline_pixel_configured: false }));
    expect(r.verdict).toBe('FAIL');
    expect(r.reasons).toContain('pipeline_pixel_not_configured');
  });

  it('returns FAIL when pending critical', () => {
    const r = computeEdogVerdict(base({ pending_pixel_events: 20_000 }));
    expect(r.verdict).toBe('FAIL');
  });

  it('returns DEGRADED when batch lag 30h', () => {
    const r = computeEdogVerdict(
      base({ batch_exports_updated_at_ms: NOW - 30 * 3_600_000 }),
    );
    expect(r.verdict).toBe('DEGRADED');
  });

  it('returns FAIL when batch stale 50h', () => {
    const r = computeEdogVerdict(
      base({ batch_exports_updated_at_ms: NOW - 50 * 3_600_000 }),
    );
    expect(r.verdict).toBe('FAIL');
  });
});

describe('shouldProbeWarehouseQ1', () => {
  it('skips when pending critical', () => {
    expect(shouldProbeWarehouseQ1(base({ pending_pixel_events: 15_000 }))).toBe(false);
  });

  it('allows when healthy', () => {
    expect(shouldProbeWarehouseQ1(base())).toBe(true);
  });
});
