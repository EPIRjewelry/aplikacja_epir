import { describe, expect, it } from 'vitest';
import { classifyWarehouseCatchUpBlockage } from './warehouse-catchup-blockage';

describe('classifyWarehouseCatchUpBlockage', () => {
  const nowMs = Date.parse('2026-09-29T02:00:00.000Z');
  const may14 = Date.parse('2026-05-14T21:59:00.808Z');

  it('scenariusz 29.09: pending ~172k + kursor Maj → watermark_reset', () => {
    const r = classifyWarehouseCatchUpBlockage({
      pendingBefore: 172_723,
      last_pixel_export_at: may14,
      last_pixel_export_id: '',
      pipelineConfigured: true,
      nowMs,
    });
    expect(r.blockage).toBe('watermark_reset');
    expect(r.catchupCapacity).toBe(30_000);
    expect(r.simulatedPendingAfter).toBe(142_723);
    expect(r.simulatedPendingAfter).toBeGreaterThan(10_000);
    expect(r.logLine).toContain('blockage=watermark_reset');
  });

  it('kursor 0 → watermark_reset', () => {
    const r = classifyWarehouseCatchUpBlockage({
      pendingBefore: 200_000,
      last_pixel_export_at: 0,
      pipelineConfigured: true,
      nowMs,
    });
    expect(r.blockage).toBe('watermark_reset');
  });

  it('pending ≈ total → watermark_reset', () => {
    const r = classifyWarehouseCatchUpBlockage({
      pendingBefore: 180_000,
      last_pixel_export_at: nowMs - 60_000,
      pipelineConfigured: true,
      totalPixelApprox: 185_000,
      nowMs,
    });
    expect(r.blockage).toBe('watermark_reset');
  });

  it('zdrowy świeży kursor + pending > capacity → catchup_limit', () => {
    const r = classifyWarehouseCatchUpBlockage({
      pendingBefore: 35_000,
      last_pixel_export_at: nowMs - 3_600_000,
      pipelineConfigured: true,
      nowMs,
    });
    expect(r.blockage).toBe('catchup_limit');
    expect(r.simulatedPendingAfter).toBe(5_000);
  });

  it('brak pipeline → pipeline', () => {
    const r = classifyWarehouseCatchUpBlockage({
      pendingBefore: 100,
      last_pixel_export_at: nowMs,
      pipelineConfigured: false,
      nowMs,
    });
    expect(r.blockage).toBe('pipeline');
  });

  it('mały backlog → none (symulacja poniżej critical)', () => {
    const r = classifyWarehouseCatchUpBlockage({
      pendingBefore: 500,
      last_pixel_export_at: nowMs - 60_000,
      pipelineConfigured: true,
      nowMs,
    });
    expect(r.blockage).toBe('none');
    expect(r.simulatedPendingAfter).toBe(0);
  });
});
