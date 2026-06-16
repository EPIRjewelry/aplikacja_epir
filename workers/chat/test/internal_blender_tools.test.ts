import { describe, expect, it, vi, afterEach } from 'vitest';
import { callBlenderBridgeTool, isBlenderBridgeConfigured } from '../src/internal-blender-tools';
import type { Env } from '../src/config/bindings';

describe('internal-blender-tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports not configured without origin', async () => {
    const env = {
      BLENDER_BRIDGE_ORIGIN: '',
    } as unknown as Env;
    expect(isBlenderBridgeConfigured(env)).toBe(false);
    const out = await callBlenderBridgeTool(env, 'blender_ping', {});
    expect(out.error?.code).toBe('blender_bridge_not_configured');
  });

  it('is configured with origin only (no relay bearer)', () => {
    const env = {
      BLENDER_BRIDGE_ORIGIN: 'https://bridge.example.com',
    } as unknown as Env;
    expect(isBlenderBridgeConfigured(env)).toBe(true);
  });

  it('proxies allowlisted tool with relay bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, error: null, warnings: [], metrics: {}, logs: ['pong'], timing_ms: 1 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      BLENDER_BRIDGE_ORIGIN: 'https://bridge.example.com',
      EPIR_OPERATOR_PANEL_SECRET: 'bridge-shared-secret',
    } as unknown as Env;

    const out = await callBlenderBridgeTool(env, 'blender_ping', { timeout_s: 5 });
    expect(out.result?.source).toBe('blender_bridge');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://bridge.example.com/v1/tools/blender_ping');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer bridge-shared-secret');
  });

  it('proxies run_script when not denylisted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, error: null, warnings: [], metrics: {}, logs: [], timing_ms: 1 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const env = {
      BLENDER_BRIDGE_ORIGIN: 'https://bridge.example.com',
    } as unknown as Env;
    const out = await callBlenderBridgeTool(env, 'run_script', { code: 'print(1)', confirm: true });
    expect(out.result?.source).toBe('blender_bridge');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://bridge.example.com/v1/tools/run_script');
  });

  it('proxies curve_cutter_create (not allowlist-blocked)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, error: null, warnings: [], metrics: {}, logs: [], timing_ms: 1 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      BLENDER_BRIDGE_ORIGIN: 'https://bridge.example.com',
    } as unknown as Env;

    const out = await callBlenderBridgeTool(env, 'curve_cutter_create', { name: 'cutter' });
    expect(out.result?.source).toBe('blender_bridge');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://bridge.example.com/v1/tools/curve_cutter_create');
  });

  it('resolves blender_add_curve alias to curve_cutter_create URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, error: null, warnings: [], metrics: {}, logs: [], timing_ms: 1 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const env = {
      BLENDER_BRIDGE_ORIGIN: 'https://bridge.example.com',
    } as unknown as Env;

    await callBlenderBridgeTool(env, 'blender_add_curve', { object_name: 'Band', name: 'cutter' });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://bridge.example.com/v1/tools/curve_cutter_create');
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
      BLENDER_BRIDGE_ORIGIN: 'https://bridge.example.com',
    } as unknown as Env;

    const out = await callBlenderBridgeTool(env, 'blender_ping', {});
    expect(out.error?.code).toBe('BLENDER_OFFLINE');
    expect(out.error?.message).toContain('Start MCP Bridge');
  });
});
