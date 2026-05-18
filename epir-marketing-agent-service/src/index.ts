import { routeAgentRequest } from 'agents';
import type { Env } from './env';

export { MarketingSidecarAgent } from './marketing-sidecar-agent';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;

    const url = new URL(request.url);
    if (url.pathname === '/healthz' || url.pathname === '/health') {
      return Response.json({ ok: true, service: 'epir_analityc' });
    }

    return new Response('Not found', { status: 404 });
  },
};
