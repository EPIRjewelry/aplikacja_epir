import { describe, expect, it, vi } from 'vitest';
import { runWarehouseExportCatchUp } from './warehouse-export-catchup';

describe('runWarehouseExportCatchUp', () => {
  it('stops when pending below target', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ pixelExported: 2500, messagesExported: 0, pending_pixel_after: 5000 })
      .mockResolvedValueOnce({ pixelExported: 2500, messagesExported: 0, pending_pixel_after: 800 });
    const r = await runWarehouseExportCatchUp(run, { maxRuns: 5, targetPending: 1000 });
    expect(r.runs).toBe(2);
    expect(r.lastPending).toBe(800);
  });

  it('stops on pipeline error', async () => {
    const run = vi.fn().mockResolvedValue({
      pixelExported: 0,
      messagesExported: 0,
      pending_pixel_after: 20000,
      pipeline_error: 'HTTP 403',
    });
    const r = await runWarehouseExportCatchUp(run);
    expect(r.runs).toBe(1);
    expect(r.pipelineError).toContain('403');
  });
});
