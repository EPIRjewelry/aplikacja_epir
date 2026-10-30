import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("gemma day-1 smoke (local workerd)", () => {
  it("GET /health returns ok without live shop", async () => {
    const request = new Request("http://gemma.test/health");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      worker: string;
      legacyMcp: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.worker).toBe("gemma");
    expect(body.legacyMcp).toBe(false);
  });

  it("rejects legacy /api/mcp path with 410", async () => {
    const request = new Request("http://gemma.test/api/mcp", {
      method: "POST",
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(410);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("legacy_/api/mcp_forbidden");
  });

  it("serves draft UCP agent profile placeholder", async () => {
    const request = new Request("http://gemma.test/ucp/agent-profile");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      capabilities: string[];
    };
    expect(body.status).toBe("draft");
    expect(body.capabilities).toContain("dev.ucp.common.ask");
    expect(body.capabilities).not.toContain("dev.shopify.catalog.global");
  });
});
