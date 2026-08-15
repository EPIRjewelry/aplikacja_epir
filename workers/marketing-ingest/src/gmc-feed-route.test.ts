/// <reference types="@cloudflare/workers-types" />

import { describe, expect, it, vi } from 'vitest';
import worker from './index';
import type { Env } from './env';

describe('GMC feed GET', () => {
  it('returns 503 when R2 binding is missing', async () => {
    const res = await worker.fetch(
      new Request('https://x/feed/gmc_feed.csv'),
      { MarketingAnalystAgent: {} } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(res.status).toBe(503);
  });

  it('returns 404 when object is missing', async () => {
    const res = await worker.fetch(
      new Request('https://x/feed/gmc_feed.csv'),
      {
        MarketingAnalystAgent: {},
        GMC_FEED: { get: vi.fn(async () => null) },
      } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(res.status).toBe(404);
  });

  it('serves prebuilt CSV from R2', async () => {
    const csv = 'id,title\nshopify_PL_1,Ring\n';
    const res = await worker.fetch(
      new Request('https://x/feed/gmc_feed.csv'),
      {
        MarketingAnalystAgent: {},
        GMC_FEED: {
          get: vi.fn(async () => ({ body: csv })),
        },
      } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/csv/);
    expect(await res.text()).toBe(csv);
  });
});
