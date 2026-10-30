/**
 * Gemma — Durable Object na rozmowę (Agents SDK).
 * Day 1: sesja istnieje; model za portem (zaślepka); UCP tools = po smoke fazy 0.
 * Limit: ≤400 linii. Bez bindingu AI do osobnej decyzji Krzysztofa.
 */
import { Agent } from "agents";

export class Gemma extends Agent<Env> {
  /**
   * HTTP do instancji DO (poza WebSocket chat protocol).
   * Day 1: potwierdzenie tożsamości sesji bez wyjścia do sklepu / modelu.
   */
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/session") || url.pathname === "/") {
      return Response.json({
        ok: true,
        agent: "Gemma",
        model: "stub",
        ucp: "deferred-until-phase-0-pass",
      });
    }
    return new Response("Not found", { status: 404 });
  }
}
