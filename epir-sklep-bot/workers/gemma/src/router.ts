/**
 * Czysty router HTTP (bez DO / modelu) — testowalny day-1 bez workerd.
 */

const LEGACY_MCP_SUFFIX = "/api/mcp";

export type HealthBody = {
  ok: true;
  worker: "gemma";
  legacyMcp: false;
  phase: "day1-skeleton";
};

export function handleStaticRoutes(request: Request): Response | null {
  const url = new URL(request.url);

  if (url.pathname === "/" || url.pathname === "/health") {
    const body: HealthBody = {
      ok: true,
      worker: "gemma",
      legacyMcp: false,
      phase: "day1-skeleton",
    };
    return Response.json(body);
  }

  if (url.pathname === "/ucp/agent-profile") {
    return Response.json({
      status: "draft",
      capabilities: [
        "dev.ucp.common.ask",
        "dev.ucp.shopping.catalog.search",
        "dev.ucp.shopping.catalog.lookup",
        "dev.shopify.catalog",
      ],
      note: "Filled after dual-PASS phase-0 smoke; no live shop calls in day 1.",
    });
  }

  if (
    url.pathname.endsWith(LEGACY_MCP_SUFFIX) ||
    url.pathname.includes(LEGACY_MCP_SUFFIX + "/")
  ) {
    return Response.json(
      { error: "legacy_/api/mcp_forbidden", ok: false },
      { status: 410 },
    );
  }

  return null;
}
