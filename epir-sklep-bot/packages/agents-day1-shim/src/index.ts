/**
 * Day-1 shim — wystarczający pod health + routing testów lokalnych.
 * Nie emuluje Think / AIChatAgent / MCP. Po `npm i agents` usuń ten pakiet
 * z workspaces i przywróć zależność npm.
 */

export class Agent<Env = unknown> {
  readonly ctx: DurableObjectState;
  readonly env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (typeof this.onRequest === "function") {
      return this.onRequest(request);
    }
    return new Response("Not found", { status: 404 });
  }

  onRequest?(request: Request): Promise<Response> | Response;
}

/**
 * Minimalny router zgodny z konwencją /agents/:AgentName/:instance/...
 * Pełne zachowanie → oficjalne `agents` (OF Cloudflare).
 */
export async function routeAgentRequest(
  request: Request,
  env: Record<string, DurableObjectNamespace | undefined>,
): Promise<Response | null> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "agents" || parts.length < 2) {
    return null;
  }

  const agentName = parts[1];
  const instanceName = parts[2] || "default";
  const restPath = "/" + parts.slice(3).join("/");

  const binding =
    env[agentName] ||
    env[agentName.charAt(0).toUpperCase() + agentName.slice(1)];

  if (!binding || typeof binding.idFromName !== "function") {
    return null;
  }

  const id = binding.idFromName(instanceName);
  const stub = binding.get(id);
  const forwardUrl = new URL(request.url);
  forwardUrl.pathname = restPath === "/" ? "/" : restPath;
  return stub.fetch(new Request(forwardUrl.toString(), request));
}
