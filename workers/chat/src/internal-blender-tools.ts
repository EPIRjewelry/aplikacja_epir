/**
 * Proxy narzędzi Blender_assist HTTP relay — tylko kanał internal-dashboard.
 * Origin: var BLENDER_BRIDGE_ORIGIN (worker). Relay bez Bearer (domyślnie).
 * Studio auth: EPIR_OPERATOR_PANEL_SECRET (tylko do API workera, nie do relay).
 */
import type { Env } from './config/bindings';
import { chatPipelineLog } from './utils/chat-pipeline-log';

/** Zgodne z Blender_assist relay/allowlist.py i docs/BLENDER_BRIDGE_HTTP.md */
export const BLENDER_BRIDGE_ALLOWLIST_V1 = [
  'blender_ping',
  'scene_list_objects',
  'object_get_info',
  'object_convert_to_mesh',
  'mesh_get_bbox_mm',
  'mesh_check_manifold',
  'jewelry_mass_report',
  'export_stl',
  'render_packshot',
  'apply_material_preset',
] as const;

export type BlenderBridgeToolName = (typeof BLENDER_BRIDGE_ALLOWLIST_V1)[number];

const RENDER_TIMEOUT_MS = 130_000;
const DEFAULT_TIMEOUT_MS = 30_000;

function bridgeOrigin(env: Env): string {
  const raw =
    typeof (env as { BLENDER_BRIDGE_ORIGIN?: string }).BLENDER_BRIDGE_ORIGIN === 'string'
      ? (env as { BLENDER_BRIDGE_ORIGIN: string }).BLENDER_BRIDGE_ORIGIN.trim()
      : '';
  return raw.replace(/\/$/, '');
}

function timeoutForTool(toolName: string): number {
  if (toolName === 'render_packshot' || toolName === 'render_still' || toolName === 'export_stl') {
    return RENDER_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS;
}

/** Cloudflare HTML error pages when tunnel/origin is down (not relay JSON). */
function cloudflareOriginOfflineMessage(httpStatus: number, bodyPreview: string): string | null {
  if (httpStatus === 530 || httpStatus === 521 || httpStatus === 523) {
    return (
      'Most Blender offline: w Blenderze kliknij Start MCP Bridge (addon uruchamia relay + tunel). ' +
      'Setup raz: Blender_assist\\scripts\\setup-blender-bridge-once.ps1.'
    );
  }
  if (httpStatus === 502 || httpStatus === 503) {
    return 'Most Blender offline: relay lub cloudflared na PC nie działa.';
  }
  const lower = bodyPreview.toLowerCase();
  if (lower.includes('cloudflare') && (lower.includes('error') || lower.includes('<!doctype'))) {
    return 'Most Blender offline: tunnel/relay nie działa na PC — Start MCP Bridge w Blenderze.';
  }
  return null;
}

export function isBlenderBridgeConfigured(env: Env): boolean {
  return Boolean(bridgeOrigin(env));
}

export async function callBlenderBridgeTool(
  env: Env,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<{ result?: Record<string, unknown>; error?: { code: number | string; message: string; details?: string } }> {
  const t0 = Date.now();
  const origin = bridgeOrigin(env);

  if (!origin) {
    chatPipelineLog({
      phase: 'blender_bridge_tool',
      duration_ms: Date.now() - t0,
      ok: false,
      reason: 'not_configured',
    });
    return {
      error: {
        code: 'blender_bridge_not_configured',
        message: 'Most Blender nie jest skonfigurowany na workerze (BLENDER_BRIDGE_ORIGIN).',
      },
    };
  }

  if (!BLENDER_BRIDGE_ALLOWLIST_V1.includes(toolName as BlenderBridgeToolName)) {
    return {
      error: {
        code: 'tool_not_allowed',
        message: `Narzędzie poza allowlistą v1: ${toolName}`,
      },
    };
  }

  const url = `${origin}/v1/tools/${encodeURIComponent(toolName)}`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(args ?? {}),
      signal: AbortSignal.timeout(timeoutForTool(toolName)),
    });
    const text = await r.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      const preview = text.slice(0, 800);
      const tunnelMsg = cloudflareOriginOfflineMessage(r.status, preview);
      chatPipelineLog({
        phase: 'blender_bridge_tool',
        duration_ms: Date.now() - t0,
        ok: false,
        http_status: r.status,
        tool: toolName,
        reason: tunnelMsg ? 'cloudflare_origin_offline' : 'invalid_json',
      });
      return {
        error: {
          code: tunnelMsg ? 'BLENDER_OFFLINE' : r.status,
          message: tunnelMsg ?? `blender-bridge invalid JSON (HTTP ${r.status})`,
          details: preview,
        },
      };
    }

    const ok = json.ok === true;
    chatPipelineLog({
      phase: 'blender_bridge_tool',
      duration_ms: Date.now() - t0,
      ok,
      http_status: r.status,
      tool: toolName,
    });

    if (!r.ok || !ok) {
      const errObj = json.error as { code?: string; message?: string } | null | undefined;
      return {
        error: {
          code: errObj?.code ?? r.status,
          message: errObj?.message ?? `blender-bridge HTTP ${r.status}`,
          details: text.slice(0, 800),
        },
        result: json,
      };
    }

    return {
      result: {
        source: 'blender_bridge',
        tool: toolName,
        payload: json,
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    chatPipelineLog({
      phase: 'blender_bridge_tool',
      duration_ms: Date.now() - t0,
      ok: false,
      tool: toolName,
      reason: msg.slice(0, 120),
    });
    return {
      error: {
        code: 'BLENDER_OFFLINE',
        message: 'Nie można połączyć z mostem Blender. W Blenderze: Start MCP Bridge.',
        details: msg.slice(0, 500),
      },
    };
  }
}

export async function blenderBridgeHealth(env: Env): Promise<{
  configured: boolean;
  online?: boolean;
  relay_online?: boolean;
  addon_online?: boolean;
  detail?: string;
}> {
  if (!isBlenderBridgeConfigured(env)) {
    return { configured: false, detail: 'missing_blender_bridge_origin' };
  }
  const origin = bridgeOrigin(env);
  let relayHttp = 0;
  try {
    const hr = await fetch(`${origin}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(12_000),
    });
    relayHttp = hr.status;
    // #region agent log
    chatPipelineLog({
      phase: 'blender_bridge_health',
      ok: hr.ok,
      http_status: hr.status,
      reason: 'relay_health',
    });
    // #endregion
    if (!hr.ok) {
      const preview = (await hr.text()).slice(0, 200);
      const tunnelMsg = cloudflareOriginOfflineMessage(hr.status, preview);
      return {
        configured: true,
        online: false,
        relay_online: false,
        detail: tunnelMsg ?? `relay health HTTP ${hr.status}`,
      };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // #region agent log
    chatPipelineLog({
      phase: 'blender_bridge_health',
      ok: false,
      reason: `relay_health_error:${msg.slice(0, 80)}`,
    });
    // #endregion
    return {
      configured: true,
      online: false,
      relay_online: false,
      detail: 'Most Blender offline: w Blenderze kliknij Start MCP Bridge.',
    };
  }

  const out = await callBlenderBridgeTool(env, 'blender_ping', { timeout_s: 5 });
  if (out.error) {
    // #region agent log
    chatPipelineLog({
      phase: 'blender_bridge_health',
      ok: false,
      http_status: relayHttp,
      reason: `addon_ping:${String(out.error.code)}`,
    });
    // #endregion
    return {
      configured: true,
      online: false,
      relay_online: true,
      addon_online: false,
      detail:
        out.error.code === 'BLENDER_OFFLINE'
          ? 'Relay OK — w Blenderze kliknij Start MCP Bridge (addon TCP :8765).'
          : out.error.message,
    };
  }
  return { configured: true, online: true, relay_online: true, addon_online: true };
}
