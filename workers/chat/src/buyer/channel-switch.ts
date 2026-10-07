import type {ChatBrandLock} from '../brand-lock';

/** Kanały kupującego objęte przebudową Gemma (etap 1). */
export type BuyerChannelId = 'epir-online-store' | 'kazka-hydrogen' | 'epir-zareczyny';

export type ChannelMode = 'off' | 'internal' | 'on';

/** @deprecated alias — używaj ChannelMode */
export type BuyerChannelMode = ChannelMode;

const VALID_MODES: ReadonlySet<ChannelMode> = new Set(['off', 'internal', 'on']);

export function channelKvKey(channelId: BuyerChannelId): string {
  return `gemma:channel:${channelId}`;
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
