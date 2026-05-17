import { describe, it, expect } from 'vitest';
import { handleMarketingPreview } from './ops-preview';

describe('handleMarketingPreview', () => {
  it('returns null for wrong path', async () => {
    const r = await handleMarketingPreview(new Request('https://example.test/healthz'), {});
    expect(r).toBeNull();
  });

  it('returns 404 when preview key not configured', async () => {
    const r = await handleMarketingPreview(new Request('https://example.test/ops/marketing-preview'), {});
    expect(r?.status).toBe(404);
  });

  it('returns 401 when key set but bearer wrong', async () => {
    const env = { MARKETING_OPS_PREVIEW_KEY: 'correct-token' };
    const r = await handleMarketingPreview(
      new Request('https://example.test/ops/marketing-preview', {
        headers: { Authorization: 'Bearer wrong' },
      }),
      env,
    );
    expect(r?.status).toBe(401);
  });
});
