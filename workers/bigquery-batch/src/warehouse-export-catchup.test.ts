import { describe, expect, it, vi } from 'vitest';
import { dryRunWarehouseCatchUpClassify, runWarehouseExportCatchUp } from './warehouse-export-catchup';

describe('runWarehouseExportCatchUp', () => {
  it('stops when pending below target', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        pixelExported: 2500,
        messagesExported: 0,
        pending_pixel_after: 5000,
        last_pixel_export_at: Date.now(),
      })
      .mockResolvedValueOnce({
        pixelExported: 2500,
        messagesExported: 0,
        pending_pixel_after: 800,
        last_pixel_export_at: Date.now(),
      });
    const r = await runWarehouseExportCatchUp(run, { maxRuns: 5, targetPending: 1000 });
    expect(r.runs).toBe(2);
    expect(r.lastPending).toBe(800);
    expect(r.lastSummary?.pending_pixel_after).toBe(800);
    expect(r.blockageDiag?.blockage).toBe('none');
  });

  it('stops on pipeline error', async () => {
    const run = vi.fn().mockResolvedValue({
      pixelExported: 0,
      messagesExported: 0,
      pending_pixel_after: 20000,
      pipeline_error: 'HTTP 403',
      last_pixel_export_at: Date.now(),
    });
    const r = await runWarehouseExportCatchUp(run);
    expect(r.runs).toBe(1);
    expect(r.pipelineError).toContain('403');
  });
});

describe('dryRunWarehouseCatchUpClassify (29.09 live-shaped)', () => {
  it('logs watermark_reset for May cursor + 172k pending', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = dryRunWarehouseCatchUpClassify({
      pendingBefore: 172_974,
      last_pixel_export_at: Date.parse('2026-05-14T21:59:00.808Z'),
      last_pixel_export_id: '',
      pipelineConfigured: true,
      nowMs: Date.parse('2026-09-29T02:00:00.000Z'),
    });
    expect(r.blockage).toBe('watermark_reset');
    expect(r.simulatedPendingAfter).toBeGreaterThan(10_000);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('blockage=watermark_reset'));
    log.mockRestore();
  });
});
