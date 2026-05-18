/// <reference types="@cloudflare/workers-types" />

import { describe, expect, it, vi } from 'vitest';
import worker from './index';
import type { Env } from './env';

describe('marketing analyst HTTP gate', () => {
  it('returns 404 when MARKETING_OPS_PREVIEW_KEY is not set', async () => {
    const res = await worker.fetch(
      new Request('https://x/ops/marketing-analyst/solo/refresh', { method: 'POST' }),
      { MarketingAnalystAgent: {} } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(res.status).toBe(404);
  });

  it('returns 401 when bearer does not match preview key', async () => {
    const res = await worker.fetch(
      new Request('https://x/ops/marketing-analyst/solo/refresh', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong' },
      }),
      {
        MARKETING_OPS_PREVIEW_KEY: 'good',
        MarketingAnalystAgent: {},
      } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(res.status).toBe(401);
  });

  it('forwards to Durable Object stub when authorized', async () => {
    const stubFetch = vi.fn(async () => new Response('from-do', { status: 200 }));
    const stub = { fetch: stubFetch };
    const env = {
      MARKETING_OPS_PREVIEW_KEY: 'tok',
      MarketingAnalystAgent: {
        idFromName: vi.fn(() => 'id'),
        get: vi.fn(() => stub),
      },
    } as unknown as Env;
    const res = await worker.fetch(
      new Request('https://x/ops/marketing-analyst/my-session/refresh', {
        method: 'POST',
        headers: { Authorization: 'Bearer tok' },
      }),
      env,
      {} as ExecutionContext,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('from-do');
    const ns = env.MarketingAnalystAgent as unknown as { idFromName: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
    expect(ns.idFromName).toHaveBeenCalledWith('my-session');
    expect(stubFetch).toHaveBeenCalled();
  });
});
