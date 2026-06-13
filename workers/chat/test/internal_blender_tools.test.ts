import { describe, expect, it, vi, afterEach } from 'vitest';
import { callBlenderBridgeTool, isBlenderBridgeConfigured } from '../src/internal-blender-tools';
import type { Env } from '../src/config/bindings';

describe('internal-blender-tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports not configured without origin', async () => {
    const env = {
      EPIR_OPERATOR_PANEL_SECRET: 'op',
      BLENDER_BRIDGE_ORIGIN: '',
    } as unknown as Env;
    expect(isBlenderBridgeConfigured(env)).toBe(false);
    const out = await callBlenderBridgeTool(env, 'blender_ping', {});
    expect(out.error?.code).toBe('blender_bridge_not_configured');
  });

  it('proxies allowlisted tool with operator bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, error: null, warnings: [], metrics: {}, logs: ['pong'], timing_ms: 1 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      EPIR_OPERATOR_PANEL_SECRET: 'op-secret',
      BLENDER_BRIDGE_ORIGIN: 'https://bridge.example.com',
    } as unknown as Env;

    const out = await callBlenderBridgeTool(env, 'blender_ping', { timeout_s: 5 });
    expect(out.result?.source).toBe('blender_bridge');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://bridge.example.com/v1/tools/blender_ping');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer op-secret');
  });

  it('rejects tool outside allowlist', async () => {
    const env = {
      EPIR_OPERATOR_PANEL_SECRET: 'op',
      BLENDER_BRIDGE_ORIGIN: 'https://bridge.example.com',
    } as unknown as Env;
    const out = await callBlenderBridgeTool(env, 'run_script', {});
    expect(out.error?.code).toBe('tool_not_allowed');
  });

  it('maps Cloudflare 530 HTML to BLENDER_OFFLINE', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<!DOCTYPE html><html><body>cloudflare error 530</body></html>', {
        status: 530,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      EPIR_OPERATOR_PANEL_SECRET: 'op-secret',
      BLENDER_BRIDGE_ORIGIN: 'https://bridge.example.com',
    } as unknown as Env;

    const out = await callBlenderBridgeTool(env, 'blender_ping', {});
    expect(out.error?.code).toBe('BLENDER_OFFLINE');
    expect(out.error?.message).toContain('tunnel Cloudflare');
  });
});
