import { describe, expect, it, vi } from 'vitest';
import worker from './index';
import { VALID_QUERY_IDS } from '../../bigquery-batch/src/analytics-query-ids';
import { __resetAnalystRateLimitForTests } from './analyst-rate-limit';

const validId = VALID_QUERY_IDS[0];

const jsonHeaders = (auth?: string) => {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) h.Authorization = auth;
  return h;
};

describe('epir-analyst-worker', () => {
  it('GET /healthz returns ok', async () => {
    const res = await worker.fetch(new Request('http://x/healthz'), {});
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('POST /v1/warehouse/query without ANALYST_HTTP_BEARER returns 503', async () => {
    const res = await worker.fetch(
      new Request('http://x/v1/warehouse/query', {
        method: 'POST',
        headers: jsonHeaders(),
        body: '{}',
      }),
      {
        BIGQUERY_BATCH_RPC: {
          runAnalyticsQuery: async () => ({ ok: true as const, queryId: validId, rows: [] }),
        },
      },
    );
    expect(res.status).toBe(503);
  });

  it('POST with wrong Bearer returns 401', async () => {
    const res = await worker.fetch(
      new Request('http://x/v1/warehouse/query', {
        method: 'POST',
        headers: jsonHeaders('Bearer wrong'),
        body: JSON.stringify({ queryId: validId }),
      }),
      {
        ANALYST_HTTP_BEARER: 'secret',
        BIGQUERY_BATCH_RPC: {
          runAnalyticsQuery: async () => ({ ok: true as const, queryId: validId, rows: [] }),
        },
      },
    );
    expect(res.status).toBe(401);
  });

  it('POST without BIGQUERY_BATCH_RPC returns 503', async () => {
    const res = await worker.fetch(
      new Request('http://x/v1/warehouse/query', {
        method: 'POST',
        headers: jsonHeaders('Bearer secret'),
        body: JSON.stringify({ queryId: validId }),
      }),
      { ANALYST_HTTP_BEARER: 'secret' },
    );
    expect(res.status).toBe(503);
  });

  it('POST without application/json Content-Type returns 415', async () => {
    const res = await worker.fetch(
      new Request('http://x/v1/warehouse/query', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret', 'Content-Type': 'text/plain' },
        body: JSON.stringify({ queryId: validId }),
      }),
      {
        ANALYST_HTTP_BEARER: 'secret',
        BIGQUERY_BATCH_RPC: {
          runAnalyticsQuery: async () => ({ ok: true as const, queryId: validId, rows: [] }),
        },
      },
    );
    expect(res.status).toBe(415);
  });

  it('POST with valid queryId calls RPC and returns 200', async () => {
    const runAnalyticsQuery = vi.fn(async () => ({
      ok: true as const,
      queryId: validId,
      rows: [{ a: 1 }],
    }));
    const res = await worker.fetch(
      new Request('http://x/v1/warehouse/query', {
        method: 'POST',
        headers: jsonHeaders('Bearer secret'),
        body: JSON.stringify({ queryId: validId }),
      }),
      { ANALYST_HTTP_BEARER: 'secret', BIGQUERY_BATCH_RPC: { runAnalyticsQuery } },
    );
    expect(res.status).toBe(200);
    expect(runAnalyticsQuery).toHaveBeenCalledWith({ queryId: validId });
    expect(await res.json()).toEqual({ ok: true, queryId: validId, rows: [{ a: 1 }] });
  });

  it('POST with unknown queryId returns 400 without validQueryIds by default', async () => {
    const res = await worker.fetch(
      new Request('http://x/v1/warehouse/query', {
        method: 'POST',
        headers: jsonHeaders('Bearer secret'),
        body: JSON.stringify({ queryId: 'NOT_WHITELISTED' }),
      }),
      {
        ANALYST_HTTP_BEARER: 'secret',
        ANALYST_EXPOSE_VALID_QUERY_IDS: 'false',
        BIGQUERY_BATCH_RPC: {
          runAnalyticsQuery: async () => ({ ok: true as const, queryId: validId, rows: [] }),
        },
      },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { validQueryIds?: string[] };
    expect(body.validQueryIds).toBeUndefined();
  });

  it('POST with unknown queryId includes validQueryIds when ANALYST_EXPOSE_VALID_QUERY_IDS=true', async () => {
    const res = await worker.fetch(
      new Request('http://x/v1/warehouse/query', {
        method: 'POST',
        headers: jsonHeaders('Bearer secret'),
        body: JSON.stringify({ queryId: 'NOT_WHITELISTED' }),
      }),
      {
        ANALYST_HTTP_BEARER: 'secret',
        ANALYST_EXPOSE_VALID_QUERY_IDS: 'true',
        BIGQUERY_BATCH_RPC: {
          runAnalyticsQuery: async () => ({ ok: true as const, queryId: validId, rows: [] }),
        },
      },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { validQueryIds?: string[] };
    expect(body.validQueryIds).toEqual([...VALID_QUERY_IDS]);
  });

  it('POST with invalid JSON returns 400', async () => {
    const res = await worker.fetch(
      new Request('http://x/v1/warehouse/query', {
        method: 'POST',
        headers: jsonHeaders('Bearer secret'),
        body: 'not-json',
      }),
      {
        ANALYST_HTTP_BEARER: 'secret',
        BIGQUERY_BATCH_RPC: {
          runAnalyticsQuery: async () => ({ ok: true as const, queryId: validId, rows: [] }),
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it('RPC error forwards status from result', async () => {
    const res = await worker.fetch(
      new Request('http://x/v1/warehouse/query', {
        method: 'POST',
        headers: jsonHeaders('Bearer secret'),
        body: JSON.stringify({ queryId: validId }),
      }),
      {
        ANALYST_HTTP_BEARER: 'secret',
        BIGQUERY_BATCH_RPC: {
          runAnalyticsQuery: async () => ({
            ok: false as const,
            error: 'bad',
            status: 422,
          }),
        },
      },
    );
    expect(res.status).toBe(422);
  });

  it('returns 429 when rate limit exceeded', async () => {
    __resetAnalystRateLimitForTests();
    const runAnalyticsQuery = vi.fn(async () => ({
      ok: true as const,
      queryId: validId,
      rows: [],
    }));
    const env = {
      ANALYST_HTTP_BEARER: 'secret',
      ANALYST_RATE_LIMIT_MAX: '2',
      ANALYST_RATE_LIMIT_WINDOW_MS: '60000',
      BIGQUERY_BATCH_RPC: { runAnalyticsQuery },
    };
    const mk = () =>
      new Request('http://x/v1/warehouse/query', {
        method: 'POST',
        headers: { ...jsonHeaders('Bearer secret'), 'CF-Connecting-IP': '203.0.113.55' },
        body: JSON.stringify({ queryId: validId }),
      });
    expect((await worker.fetch(mk(), env)).status).toBe(200);
    expect((await worker.fetch(mk(), env)).status).toBe(200);
    const res429 = await worker.fetch(mk(), env);
    expect(res429.status).toBe(429);
    const j = (await res429.json()) as { error?: string; retry_after_seconds?: number };
    expect(j.error).toBe('rate_limited');
    expect(j.retry_after_seconds).toBeGreaterThanOrEqual(1);
    expect(res429.headers.get('Retry-After')).toBeTruthy();
    __resetAnalystRateLimitForTests();
  });
});
