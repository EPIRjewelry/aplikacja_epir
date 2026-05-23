import { describe, expect, it, vi } from 'vitest';
import { checkEdogGateForWarehouse } from '../src/edog-gate';

describe('checkEdogGateForWarehouse', () => {
  it('allows when gate disabled', async () => {
    const r = await checkEdogGateForWarehouse({ EDOG_GATE_ENABLED: 'false' } as never);
    expect(r.allowed).toBe(true);
  });

  it('blocks when getFlowHealth returns FAIL', async () => {
    const r = await checkEdogGateForWarehouse({
      EDOG_GATE_ENABLED: 'true',
      BIGQUERY_BATCH_RPC: {
        getFlowHealth: vi.fn().mockResolvedValue({ edog_verdict: 'FAIL', reasons: ['x'] }),
      },
    } as never);
    expect(r.allowed).toBe(false);
  });
});
