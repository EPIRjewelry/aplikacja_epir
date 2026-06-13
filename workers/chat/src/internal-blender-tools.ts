/**
 * Proxy narzędzi Blender_assist HTTP relay — tylko kanał internal-dashboard.
 * Auth: Bearer = EPIR_OPERATOR_PANEL_SECRET. Origin: var BLENDER_BRIDGE_ORIGIN.
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

function operatorBearer(env: Env): string {
  return env.EPIR_OPERATOR_PANEL_SECRET?.trim() ?? '';
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
      'Setup raz: Blender_assist\\scripts\\setup-blender-bridge-once.ps1 + .env z tym samym kluczem co Studio.'
    );
  }
  if (httpStatus === 502 || httpStatus === 503) {
    return 'Most Blender offline: origin niedostępny (relay lub cloudflared na PC).';
  }
  const lower = bodyPreview.toLowerCase();
  if (lower.includes('cloudflare') && (lower.includes('error') || lower.includes('<!doctype'))) {
    return (
      'Most Blender offline: odpowiedź HTML z Cloudflare zamiast JSON — tunnel/relay nie działa na PC grafika.'
    );
  }
  return null;
}

export function isBlenderBridgeConfigured(env: Env): boolean {
  return Boolean(bridgeOrigin(env) && operatorBearer(env));
}

export async function callBlenderBridgeTool(
  env: Env,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<{ result?: Record<string, unknown>; error?: { code: number | string; message: string; details?: string } }> {
  const t0 = Date.now();
  const origin = bridgeOrigin(env);
  const bearer = operatorBearer(env);

  if (!origin || !bearer) {
    chatPipelineLog({
      phase: 'blender_bridge_tool',
      duration_ms: Date.now() - t0,
      ok: false,
      reason: 'not_configured',
    });
    return {
      error: {
        code: 'blender_bridge_not_configured',
        message:
          'Most Blender nie jest skonfigurowany: ustaw var BLENDER_BRIDGE_ORIGIN na workerze czatu i EPIR_OPERATOR_PANEL_SECRET (relay + worker).',
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
        Authorization: `Bearer ${bearer}`,
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
        message:
          'Nie można połączyć z mostem Blender (relay/tunnel). Uruchom addon + python -m relay na PC.',
        details: msg.slice(0, 500),
      },
    };
  }
}

export async function blenderBridgeHealth(env: Env): Promise<{
  configured: boolean;
  online?: boolean;
  detail?: string;
}> {
  if (!isBlenderBridgeConfigured(env)) {
    return { configured: false, detail: 'missing_origin_or_operator_secret' };
  }
  const out = await callBlenderBridgeTool(env, 'blender_ping', { timeout_s: 5 });
  if (out.error) {
    return { configured: true, online: false, detail: out.error.message };
  }
  return { configured: true, online: true };
}
