/// <reference types="@cloudflare/workers-types" />

import { runStewardAggregation, type StewardEnv } from './pipeline';

export { StoreStewardS2SRpc } from './rpc';

/**
 * epir-store-steward — agregacja analityki sklepu (Faza 0).
 * Odczyt/zapis: wyłącznie Workers RPC (`StoreStewardS2SRpc`) przez service binding.
 * Zewnątrz (Cursor): HTTP na `epir-analyst-worker` + `ANALYST_HTTP_BEARER` (proxy RPC).
 */
export default {
  async fetch(request: Request, _env: StewardEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/healthz')) {
      return new Response('ok', { status: 200 });
    }
    if (url.pathname.startsWith('/internal/steward')) {
      return Response.json(
        {
          error: 'steward_http_deprecated_use_rpc',
          hint: 'Wołaj StoreStewardS2SRpc przez service binding albo POST/GET /v1/steward/* na epir-analyst-worker (Bearer ANALYST_HTTP_BEARER).',
        },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return new Response('Not Found', { status: 404 });
  },

  async scheduled(_controller: ScheduledController, env: StewardEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runStewardAggregation(env).catch((err) => {
        console.error('[store-steward] cron aggregate failed', err);
      }),
    );
  },
};
