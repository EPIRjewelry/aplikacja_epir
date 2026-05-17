/// <reference types="@cloudflare/workers-types" />

import { VALID_QUERY_IDS } from '../../bigquery-batch/src/analytics-query-ids';

/**
 * epir-analyst-worker — HTTP + Bearer dla Cursora; R2 SQL wyłącznie przez RPC do epir-bigquery-batch.
 * Brak surowego SQL z klienta — tylko whitelist `queryId` (jak `run_analytics_query` w czacie).
 */

export type BigQueryBatchRpcStub = {
  runAnalyticsQuery(args: { queryId?: string }): Promise<
    | { ok: true; queryId: string; rows: Record<string, unknown>[] }
    | { ok: false; error: string; status: number }
  >;
};

export interface Env {
  BIGQUERY_BATCH_RPC?: BigQueryBatchRpcStub;
  /** Sekret: wrangler secret put ANALYST_HTTP_BEARER --env="" */
  ANALYST_HTTP_BEARER?: string;
}

function parseBearer(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+(\S+)/i.exec(auth);
  return m?.[1]?.trim() ?? null;
}

function isAuthorized(req: Request, env: Env): boolean {
  const expected = (env.ANALYST_HTTP_BEARER ?? '').trim();
  if (!expected) return false;
  const token = parseBearer(req);
  return token === expected;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url);
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/healthz')) {
      return new Response('ok', { status: 200 });
    }

    if (req.method === 'POST' && u.pathname === '/v1/warehouse/query') {
      const expected = (env.ANALYST_HTTP_BEARER ?? '').trim();
      if (!expected) {
        return new Response(JSON.stringify({ error: 'ANALYST_HTTP_BEARER not configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }
      if (!isAuthorized(req, env)) {
        return new Response('Unauthorized', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store' },
        });
      }
      if (!env.BIGQUERY_BATCH_RPC) {
        return new Response(JSON.stringify({ error: 'BIGQUERY_BATCH_RPC binding missing' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }

      let body: { queryId?: string };
      try {
        body = (await req.json()) as { queryId?: string };
      } catch {
        return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }
      const queryId = typeof body.queryId === 'string' ? body.queryId.trim() : '';
      if (!queryId || !VALID_QUERY_IDS.includes(queryId)) {
        return new Response(
          JSON.stringify({
            error: 'invalid or missing queryId',
            validQueryIds: VALID_QUERY_IDS,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
        );
      }

      const result = await env.BIGQUERY_BATCH_RPC.runAnalyticsQuery({ queryId });
      const status = result.ok ? 200 : result.status >= 400 && result.status < 600 ? result.status : 500;
      return new Response(JSON.stringify(result), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
