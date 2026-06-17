import { describe, expect, it } from 'vitest';
import { buildEdogNarrative } from './edog-reason-narrative';
import type { FlowHealthReport } from './edog-flow-health-runner';

function base(overrides: Partial<FlowHealthReport> = {}): FlowHealthReport {
  return {
    pending_pixel_events: 10,
    batch_exports: {
      last_pixel_export_at: Date.now() - 3_600_000,
      last_messages_export_at: Date.now() - 3_600_000,
      updated_at: Date.now() - 3_600_000,
    },
    pipeline_pixel_configured: true,
    pipeline_messages_configured: true,
    d1_pixel_events_24h: 50,
    d1_messages_24h: 5,
    warehouse_q1_ok: true,
    warehouse_q1_row_count: 3,
    warehouse_q1_skipped: false,
    checked_at: new Date().toISOString(),
    edog_verdict: 'PASS',
    reasons: ['ok'],
    ...overrides,
  };
}

describe('buildEdogNarrative', () => {
  it('PASS includes diagnosis and layers', () => {
    const n = buildEdogNarrative(base());
    expect(n.diagnosis).toContain('PASS');
    expect(n.layers.length).toBe(6);
    expect(n.markdown).toContain('Warstwy');
  });

  it('FAIL pending critical suggests trigger export', () => {
    const n = buildEdogNarrative(
      base({
        edog_verdict: 'FAIL',
        pending_pixel_events: 23_173,
        reasons: ['pending_pixel_events_critical:23173', 'batch_exports_stale_hours:319.0'],
        batch_exports: {
          last_pixel_export_at: Date.parse('2026-06-03T02:00:00.000Z'),
          last_messages_export_at: 0,
          updated_at: Date.parse('2026-06-03T02:00:00.000Z'),
        },
        warehouse_q1_skipped: true,
        warehouse_q1_ok: false,
      }),
    );
    expect(n.actions.some((a) => a.includes('trigger-warehouse-export'))).toBe(true);
    expect(n.markdown).toContain('23173');
    expect(n.layers.find((l) => l.id === 'batch')?.status).toBe('FAIL');
  });
});
