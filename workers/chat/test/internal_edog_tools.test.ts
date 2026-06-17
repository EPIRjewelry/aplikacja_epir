import { describe, expect, it, vi } from 'vitest';
import { getFlowHealthTool } from '../src/internal-edog-tools';

describe('getFlowHealthTool', () => {
  it('returns error when RPC missing', async () => {
    const r = await getFlowHealthTool({} as never);
    expect(r.error?.message).toContain('getFlowHealth');
  });

  it('returns flow health report from RPC', async () => {
    const report = {
      edog_verdict: 'FAIL',
      reasons: ['pending_pixel_events_critical:100'],
      narrative_markdown: '## Diagnoza',
    };
    const r = await getFlowHealthTool({
      BIGQUERY_BATCH_RPC: {
        getFlowHealth: vi.fn().mockResolvedValue(report),
      },
    } as never);
    expect(r.result?.source).toBe('edog_flow_health');
    expect(r.result?.edog_verdict).toBe('FAIL');
  });
});
