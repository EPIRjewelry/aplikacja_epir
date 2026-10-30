/**
 * Entry Gemma — router. Limit: ≤80 linii. Logiki narzędzi tu nie ma.
 */
import { routeAgentRequest } from "agents";
export { Gemma } from "./agent";
import { handleStaticRoutes } from "./router";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const staticResponse = handleStaticRoutes(request);
    if (staticResponse) return staticResponse;

    return (
      (await routeAgentRequest(
        request,
        env as unknown as Record<string, DurableObjectNamespace | undefined>,
      )) || new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
