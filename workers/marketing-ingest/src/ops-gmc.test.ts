import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMarketingPreviewBody, handleMarketingPreview } from './ops-preview';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('marketing-preview google_merchant', () => {
  it('includes google_merchant section (skipped without credentials)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'no' }), { status: 400 })),
    );
    const body = await buildMarketingPreviewBody(
      { MARKETING_OPS_PREVIEW_KEY: 'k' },
      '2026-08-11',
    );
    expect(body.google_merchant).toBeDefined();
    expect(body.google_merchant.skipped).toBe(true);
    expect(body.google_ads.rowCount).toBe(0);
    expect(body.google_analytics.rowCount).toBe(0);
  });

  it('handleMarketingPreview still auth-gates', async () => {
    const r = await handleMarketingPreview(
      new Request('https://example.test/ops/marketing-preview', {
        headers: { Authorization: 'Bearer wrong' },
      }),
      { MARKETING_OPS_PREVIEW_KEY: 'correct' },
    );
    expect(r?.status).toBe(401);
  });
});
