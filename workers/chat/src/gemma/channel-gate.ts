import type {Env} from '../config/bindings';

export type GemmaChannelMode = 'off' | 'internal' | 'on';

const VALID: ReadonlySet<GemmaChannelMode> = new Set(['off', 'internal', 'on']);

export function gemmaChannelKvKey(channel: string): string {
  return `gemma:channel:${channel.trim()}`;
}

function envKeyForChannel(channel: string): string {
  const safe = channel.trim().replace(/[^a-zA-Z0-9-]/g, '_');
  return `GEMMA_CHANNEL_${safe}`;
}

function parseMode(raw: string | null | undefined): GemmaChannelMode | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase() as GemmaChannelMode;
  return VALID.has(v) ? v : null;
}

function modeFromEnv(env: Env, channel: string): GemmaChannelMode | null {
  const record = env as Record<string, unknown>;
  const specific = record[envKeyForChannel(channel)];
  if (typeof specific === 'string') {
    const parsed = parseMode(specific);
    if (parsed) return parsed;
    return 'off';
  }
  const defaultMode = env.GEMMA_CHANNEL_DEFAULT;
  if (typeof defaultMode === 'string') {
    const parsed = parseMode(defaultMode);
    if (parsed) return parsed;
    return 'off';
  }
  const processDefault =
    typeof process !== 'undefined' ? process.env?.GEMMA_CHANNEL_DEFAULT : undefined;
  if (typeof processDefault === 'string') {
    const parsed = parseMode(processDefault);
    if (parsed) return parsed;
    return 'off';
  }
  return null;
}

export function isInternalGemmaAccess(request: Request, env: Env): boolean {
  const expected = env.EPIR_INTERNAL_KEY?.trim();
  if (!expected) return false;
  const header = request.headers.get('X-EPIR-Internal-Key') ?? request.headers.get('X-EPIR-INTERNAL-KEY');
  return typeof header === 'string' && header.trim() === expected;
}

/**
 * Fail-closed: brak wpisu KV / env ⇒ off.
 */
export async function resolveGemmaChannelMode(
  env: Env,
  channel: string,
  request?: Request,
): Promise<GemmaChannelMode> {
  const normalizedChannel = channel?.trim() || 'unknown';

  if (env.GEMMA_CHANNEL_GATE) {
    try {
      const raw = await env.GEMMA_CHANNEL_GATE.get(gemmaChannelKvKey(normalizedChannel));
      const fromKv = parseMode(raw);
      if (fromKv) return applyInternalGate(fromKv, request, env);
      if (raw) return 'off';
    } catch (err) {
      console.warn('[gemma.channel_gate] KV read failed — fail-closed', err);
      return 'off';
    }
  }

  const fromEnv = modeFromEnv(env, normalizedChannel);
  const mode = fromEnv ?? 'off';
  return applyInternalGate(mode, request, env);
}

function applyInternalGate(
  mode: GemmaChannelMode,
  request: Request | undefined,
  env: Env,
): GemmaChannelMode {
  if (mode !== 'internal') return mode;
  if (request && isInternalGemmaAccess(request, env)) return 'internal';
  return 'off';
}

export const GEMMA_UNAVAILABLE_BODY = JSON.stringify({type: 'unavailable'});
