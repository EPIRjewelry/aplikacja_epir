/**
 * Day-1 smoke bez npm registry / workerd.
 * Pełny Vitest + @cloudflare/vitest-plugin: gdy `npm install` przejdzie (egress).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleStaticRoutes } from "../src/router.ts";

describe("gemma day-1 smoke (node:test, no live shop)", () => {
  it("GET /health returns ok", async () => {
    const response = handleStaticRoutes(new Request("http://gemma.test/health"));
    assert.ok(response);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.worker, "gemma");
    assert.equal(body.legacyMcp, false);
  });

  it("rejects legacy /api/mcp with 410", async () => {
    const response = handleStaticRoutes(
      new Request("http://gemma.test/api/mcp", { method: "POST" }),
    );
    assert.ok(response);
    assert.equal(response.status, 410);
    const body = await response.json();
    assert.equal(body.error, "legacy_/api/mcp_forbidden");
  });

  it("serves draft UCP agent profile placeholder", async () => {
    const response = handleStaticRoutes(
      new Request("http://gemma.test/ucp/agent-profile"),
    );
    assert.ok(response);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "draft");
    assert.ok(body.capabilities.includes("dev.ucp.common.ask"));
    assert.equal(body.capabilities.includes("dev.shopify.catalog.global"), false);
  });
});
