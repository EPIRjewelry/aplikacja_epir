/// <reference types="@cloudflare/workers-types" />

import { VALID_QUERY_IDS } from '../../bigquery-batch/src/analytics-query-ids';
import { checkPostWarehouseRateLimit } from './analyst-rate-limit';
import type { StoreStewardRpcStub } from './steward-rpc';

/**
 * epir-analyst-worker — HTTP + Bearer dla Cursora.
 * - R2 SQL → RPC `epir-bigquery-batch`
 * - Store Steward → RPC `epir-store-steward` (bez duplikacji EPIR_CHAT_SHARED_SECRET)
 */

export type BigQueryBatchRpcStub = {
  runAnalyticsQuery(args: { queryId?: string }): Promise<
    | { ok: true; queryId: string; rows: Record<string, unknown>[] }
    | { ok: false; error: string; status: number }
  >;
};

export interface Env {
  BIGQUERY_BATCH_RPC?: BigQueryBatchRpcStub;
  STORE_STEWARD_RPC?: StoreStewardRpcStub;
  /** Sekret: wrangler secret put ANALYST_HTTP_BEARER --env="" */
  ANALYST_HTTP_BEARER?: string;
  /** "true" / "1" — w odpowiedzi 400 dołącz `validQueryIds` (tylko debug). */
  ANALYST_EXPOSE_VALID_QUERY_IDS?: string;
  /** Max liczba POST /v1/warehouse/query na klucz (IP) w oknie; domyślnie 60. */
  ANALYST_RATE_LIMIT_MAX?: string;
  /** Okno rate limitu w ms; domyślnie 60000. */
  ANALYST_RATE_LIMIT_WINDOW_MS?: string;
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

function parsePositiveInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function wantsExposeQueryIds(env: Env): boolean {
  const v = (env.ANALYST_EXPOSE_VALID_QUERY_IDS ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function isJsonContentType(req: Request): boolean {
  const ct = (req.headers.get('Content-Type') ?? '').trim().toLowerCase();
  return ct.includes('application/json');
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

      if (!isJsonContentType(req)) {
        return new Response(JSON.stringify({ error: 'Content-Type must be application/json' }), {
          status: 415,
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
        const expose = wantsExposeQueryIds(env);
        const payload = expose
          ? { error: 'invalid or missing queryId', validQueryIds: [...VALID_QUERY_IDS] }
          : { error: 'invalid or missing queryId' };
        return new Response(JSON.stringify(payload), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }

      const rlMax = parsePositiveInt(env.ANALYST_RATE_LIMIT_MAX, 60);
      const rlWindow = parsePositiveInt(env.ANALYST_RATE_LIMIT_WINDOW_MS, 60_000);
      const rlKey = req.headers.get('CF-Connecting-IP')?.trim() || 'unknown';
      const rl = checkPostWarehouseRateLimit(rlKey, rlMax, rlWindow);
      if (!rl.ok) {
        return new Response(JSON.stringify({ error: 'rate_limited', retry_after_seconds: rl.retryAfterSec }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Retry-After': String(rl.retryAfterSec),
          },
        });
      }

      const result = await env.BIGQUERY_BATCH_RPC.runAnalyticsQuery({ queryId });
      const status = result.ok ? 200 : result.status >= 400 && result.status < 600 ? result.status : 500;
      return new Response(JSON.stringify(result), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    if (u.pathname.startsWith('/v1/steward/')) {
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
      if (!env.STORE_STEWARD_RPC) {
        return new Response(JSON.stringify({ error: 'STORE_STEWARD_RPC binding missing' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }

      if (req.method === 'POST' && u.pathname === '/v1/steward/aggregate') {
        try {
          const body = await env.STORE_STEWARD_RPC.runAggregation();
          return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const status = message.includes('rpc:forbidden') ? 403 : 500;
          return Response.json({ error: 'aggregate_failed', message }, { status });
        }
      }

      if (req.method === 'GET' && u.pathname === '/v1/steward/insights') {
        try {
          const period_start = u.searchParams.get('period_start') ?? undefined;
          const period_end = u.searchParams.get('period_end') ?? undefined;
          const body = await env.STORE_STEWARD_RPC.getInsights({ period_start, period_end });
          const status = 'ok' in body && body.ok === false ? body.status : 200;
          return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const status = message.includes('rpc:forbidden') ? 403 : 500;
          return Response.json({ error: 'insights_read_failed', message }, { status });
        }
      }

      if (req.method === 'POST' && u.pathname === '/v1/steward/reports') {
        if (!isJsonContentType(req)) {
          return new Response(JSON.stringify({ error: 'Content-Type must be application/json' }), {
            status: 415,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          });
        }
        let payload: {
          period_start?: string;
          period_end?: string;
          report_markdown?: string;
          run_id?: string;
          agent_id?: string;
        };
        try {
          payload = (await req.json()) as typeof payload;
        } catch {
          return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          });
        }
        try {
          const result = await env.STORE_STEWARD_RPC.saveReport({
            period_start: payload.period_start,
            period_end: payload.period_end,
            report_markdown: payload.report_markdown ?? '',
            run_id: payload.run_id,
            agent_id: payload.agent_id,
          });
          return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const status = message.includes('rpc:forbidden') ? 403 : message.includes('required') ? 400 : 500;
          return Response.json({ error: 'report_save_failed', message }, { status });
        }
      }

      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
