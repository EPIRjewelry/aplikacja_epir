import { describe, expect, it, vi } from 'vitest';
import worker from './index';
import { VALID_QUERY_IDS } from '../../bigquery-batch/src/analytics-query-ids';

const validId = VALID_QUERY_IDS[0];

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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
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
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
        body: JSON.stringify({ queryId: validId }),
      }),
      { ANALYST_HTTP_BEARER: 'secret' },
    );
    expect(res.status).toBe(503);
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
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
        body: JSON.stringify({ queryId: validId }),
      }),
      { ANALYST_HTTP_BEARER: 'secret', BIGQUERY_BATCH_RPC: { runAnalyticsQuery } },
    );
    expect(res.status).toBe(200);
    expect(runAnalyticsQuery).toHaveBeenCalledWith({ queryId: validId });
    expect(await res.json()).toEqual({ ok: true, queryId: validId, rows: [{ a: 1 }] });
  });

  it('POST with unknown queryId returns 400', async () => {
    const res = await worker.fetch(
      new Request('http://x/v1/warehouse/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
        body: JSON.stringify({ queryId: 'NOT_WHITELISTED' }),
      }),
      {
        ANALYST_HTTP_BEARER: 'secret',
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
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
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
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
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
});
