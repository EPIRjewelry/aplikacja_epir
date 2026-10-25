/// <reference types="@cloudflare/workers-types" />

import type { Env } from './env';
import { InpsaApiClient } from './inpsa-api';
import { parseInpsaEnv } from './inpsa-config';
import { pollOrdersEventsPipeline, reconcilePaidOrders } from './orders/poll';
import { opsJson, opsNotConfigured, opsUnauthorized, verifyOperatorBearer } from './ops-auth';

export type { Env } from './env';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function handleOps(req: Request, env: Env): Promise<Response | null> {
  const path = new URL(req.url).pathname;
  if (!path.startsWith('/ops/inpsa-')) return null;

  if (!env.EPIR_OPERATOR_PANEL_SECRET?.trim()) return opsNotConfigured();
  if (!verifyOperatorBearer(req, env)) return opsUnauthorized();

  if (path === '/ops/inpsa-smoke' && req.method === 'GET') {
    try {
      const client = new InpsaApiClient(env);
      const result = await client.runStageSmoke({ limit: 1 });
      return opsJson({ ok: true, smoke: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return opsJson({ ok: false, error: message }, 502);
    }
  }

  if (path === '/ops/inpsa-orders-events-poll' && req.method === 'POST') {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dryRun') !== '0';
    try {
      const result = await pollOrdersEventsPipeline(env, {
        limit: Number(url.searchParams.get('limit') ?? '10'),
        untilId: url.searchParams.get('untilId') ?? undefined,
        dryRun,
      });
      return opsJson({ ok: result.httpStatus >= 200 && result.httpStatus < 300, dryRun, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return opsJson({ ok: false, error: message }, 502);
    }
  }

  if (path === '/ops/inpsa-orders-reconcile' && req.method === 'POST') {
    const url = new URL(req.url);
    const updatedAtGte = url.searchParams.get('updatedAtGte')?.trim();
    if (!updatedAtGte) return opsJson({ ok: false, error: 'updatedAtGte is required' }, 400);
    const dryRun = url.searchParams.get('dryRun') !== '0';
    const limit = Number(url.searchParams.get('limit') ?? '30');
    try {
      const result = await reconcilePaidOrders(env, { updatedAtGte, dryRun, limit });
      return opsJson({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return opsJson({ ok: false, error: message }, 502);
    }
  }

  return new Response('Not Found', { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const ops = await handleOps(request, env);
    if (ops) return ops;

    if (url.pathname === '/health') {
      return json({ ok: true, worker: 'epir-inpost-marketplace' });
    }

    if (url.pathname === '/' || url.pathname === '') {
      let deployment = 'unknown';
      try {
        deployment = parseInpsaEnv(env.INPSA_ENV);
      } catch {
        deployment = 'invalid';
      }
      return json({
        worker: 'epir-inpost-marketplace',
        inpsaEnv: deployment,
        note: 'INPSA marketplace ingest skeleton — not on CI deploy list. See workers/inpost-marketplace/README.md',
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
