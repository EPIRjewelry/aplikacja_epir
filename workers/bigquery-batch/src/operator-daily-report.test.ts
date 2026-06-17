import { describe, expect, it } from 'vitest';
import { buildOperatorReportMarkdown } from './operator-daily-report';
import type { FlowHealthReport } from './edog-flow-health-runner';

describe('buildOperatorReportMarkdown', () => {
  it('includes EDOG verdict and Q8 section', () => {
    const health = {
      pending_pixel_events: 0,
      batch_exports: null,
      pipeline_pixel_configured: true,
      pipeline_messages_configured: true,
      d1_pixel_events_24h: 10,
      d1_messages_24h: 2,
      warehouse_q1_ok: true,
      warehouse_q1_row_count: 1,
      warehouse_q1_skipped: false,
      checked_at: '2026-05-23T09:00:00.000Z',
      edog_verdict: 'PASS' as const,
      reasons: ['ok'],
    } satisfies FlowHealthReport;
    const md = buildOperatorReportMarkdown({
      reportDate: '2026-05-23',
      health,
      q8Rows: [{ event_date: '2026-05-22', event_count: 5 }],
      marketingSection: '_ok_',
    });
    expect(md).toContain('EDOG');
    expect(md).toContain('PASS');
    expect(md).toContain('Q8');
    expect(md).toContain('Diagnoza EDOG');
  });
});
