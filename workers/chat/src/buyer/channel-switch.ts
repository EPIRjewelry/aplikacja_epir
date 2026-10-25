import type {ChatBrandLock} from '../brand-lock';

/** Kanały kupującego objęte przebudową Gemma (etap 1). */
export type BuyerChannelId = 'epir-online-store' | 'kazka-hydrogen' | 'epir-zareczyny';

export type ChannelMode = 'off' | 'internal' | 'on';

export type GemmaCoreMode = 'legacy' | 'v2';

/** @deprecated alias — używaj ChannelMode */
export type BuyerChannelMode = ChannelMode;

const VALID_MODES: ReadonlySet<ChannelMode> = new Set(['off', 'internal', 'on']);
const VALID_CORE_MODES: ReadonlySet<GemmaCoreMode> = new Set(['legacy', 'v2']);

export function channelKvKey(channelId: BuyerChannelId): string {
  return `gemma:channel:${channelId}`;
}

export function coreKvKey(channelId: BuyerChannelId): string {
  return `gemma:core:${channelId}`;
}

/**
 * Mapuje brand-lock (serwer) na kanał kupującego.
 * Zaręczyny → `epir-zareczyny` (ta sama migawka GE, ton EPIR).
 */
export function channelIdFromBrandLock(
  lock: Pick<ChatBrandLock, 'brandKey' | 'channel'>,
): BuyerChannelId | null {
  const key = (lock.brandKey ?? '').trim().toLowerCase();
  if (key === 'kazka' || lock.channel === 'hydrogen-kazka') return 'kazka-hydrogen';
  if (key === 'zareczyny' || lock.channel === 'hydrogen-zareczyny') return 'epir-zareczyny';
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

/**
 * Migawka katalogu używana przez kanał (zaręczyny dzielą GE).
 */
export function catalogSnapshotChannel(channel: BuyerChannelId): 'epir-online-store' | 'kazka-hydrogen' {
  if (channel === 'kazka-hydrogen') return 'kazka-hydrogen';
  return 'epir-online-store';
}

function parseMode(raw: string | null | undefined): ChannelMode | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase() as ChannelMode;
  return VALID_MODES.has(v) ? v : null;
}

/**
 * Fail-closed: brak bindingu, błąd KV lub nieznana wartość → `off`.
 */
export async function readChannelMode(
  env: {GEMMA_RUNTIME_KV?: KVNamespace},
  channelId: BuyerChannelId,
): Promise<ChannelMode> {
  if (!env.GEMMA_RUNTIME_KV) return 'off';
  try {
    const raw = await env.GEMMA_RUNTIME_KV.get(channelKvKey(channelId));
    return parseMode(raw) ?? 'off';
  } catch (err) {
    console.warn('[buyer.channel_switch] KV read failed — fail-closed', err);
    return 'off';
  }
}

function parseCoreMode(raw: string | null | undefined): GemmaCoreMode | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase() as GemmaCoreMode;
  return VALID_CORE_MODES.has(v) ? v : null;
}

/** Fail-safe: brak klucza, błąd KV lub nieznana wartość → `legacy`. */
export async function readGemmaCoreMode(
  env: {GEMMA_RUNTIME_KV?: KVNamespace},
  channelId: BuyerChannelId,
): Promise<GemmaCoreMode> {
  if (!env.GEMMA_RUNTIME_KV) return 'legacy';
  try {
    const raw = await env.GEMMA_RUNTIME_KV.get(coreKvKey(channelId));
    return parseCoreMode(raw) ?? 'legacy';
  } catch (err) {
    console.warn('[buyer.channel_switch] core KV read failed — legacy', err);
    return 'legacy';
  }
}
