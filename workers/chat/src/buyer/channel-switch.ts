import type {BrandLockResult} from '../brand-lock';

/** Kanały kupującego objęte przebudową Gemma (etap 1). */
export type BuyerChannelId = 'epir-online-store' | 'kazka-hydrogen';

export type BuyerChannelMode = 'off' | 'internal' | 'on';

const VALID_MODES: ReadonlySet<BuyerChannelMode> = new Set(['off', 'internal', 'on']);

export function channelKvKey(channelId: BuyerChannelId): string {
  return `gemma:channel:${channelId}`;
}

/**
 * Mapuje brand-lock (serwer) na kanał faktów. Zaręczyny i nieznane → brak kanału kupującego.
 */
export function channelIdFromBrandLock(lock: Pick<BrandLockResult, 'brandKey' | 'channel'>): BuyerChannelId | null {
  const key = (lock.brandKey ?? '').trim().toLowerCase();
  if (key === 'kazka' || lock.channel === 'hydrogen-kazka') return 'kazka-hydrogen';
  if (
    key === 'epir' ||
    key === 'online-store' ||
    lock.channel === 'online-store' ||
    lock.channel === 'epir-liquid'
  ) {
    return 'epir-online-store';
  }
  return null;
}

function parseMode(raw: string | null | undefined): BuyerChannelMode | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase() as BuyerChannelMode;
  return VALID_MODES.has(v) ? v : null;
}

/**
 * Fail-closed: brak bindingu, błąd KV lub nieznana wartość → `off`.
 * Jedyny binding: `GEMMA_RUNTIME_KV` (operator tworzy namespace lokalnie).
 */
export async function readChannelMode(
  env: {GEMMA_RUNTIME_KV?: KVNamespace},
  channelId: BuyerChannelId,
): Promise<BuyerChannelMode> {
  if (!env.GEMMA_RUNTIME_KV) return 'off';
  try {
    const raw = await env.GEMMA_RUNTIME_KV.get(channelKvKey(channelId));
    const mode = parseMode(raw);
    if (mode) return mode;
    if (raw) return 'off';
    return 'off';
  } catch (err) {
    console.warn('[buyer.channel_switch] KV read failed — fail-closed', err);
    return 'off';
  }
}
