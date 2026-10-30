import { describe, expect, it } from 'vitest';
import { handleStorePicture } from './store-picture';

describe('handleStorePicture', () => {
  it('returns 404 when preview key missing', async () => {
    const r = await handleStorePicture(
      new Request('https://example.test/ops/store-picture'),
      {},
    );
    expect(r?.status).toBe(404);
  });

  it('returns 401 without bearer', async () => {
    const r = await handleStorePicture(
      new Request('https://example.test/ops/store-picture'),
      { MARKETING_OPS_PREVIEW_KEY: 'secret' },
    );
    expect(r?.status).toBe(401);
  });

  it('returns 400 for bad dates', async () => {
    const r = await handleStorePicture(
      new Request('https://example.test/ops/store-picture?startDate=bad', {
        headers: { Authorization: 'Bearer secret' },
      }),
      { MARKETING_OPS_PREVIEW_KEY: 'secret' },
    );
    expect(r?.status).toBe(400);
  });
});
