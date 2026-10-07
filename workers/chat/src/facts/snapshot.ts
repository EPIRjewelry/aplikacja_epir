import type {BuyerChannelId} from '../buyer/channel-switch';
import type {ProductFacts} from './types';

export const CATALOG_SNAPSHOT_SCHEMA_VERSION = 1;

/** TTL pamięci izolatu (ms) — odczyt bez KV przy ciepłym izolacie. */
const ISOLATE_CACHE_TTL_MS = 5 * 60 * 1000;

export type CatalogSnapshotPayload = {
  schemaVersion: number;
  fetchedAt: string;
  channel: BuyerChannelId;
  products: ProductFacts[];
};

type IsolateEntry = {payload: CatalogSnapshotPayload; expiresAt: number};

const isolateCache = new Map<BuyerChannelId, IsolateEntry>();

export function catalogSnapshotKey(channel: BuyerChannelId): string {
  return `catalog:v1:${channel}`;
}

export function invalidateCatalogSnapshotCache(channel?: BuyerChannelId): void {
  if (channel) isolateCache.delete(channel);
  else isolateCache.clear();
}

export async function readCatalogSnapshot(
  kv: KVNamespace,
  channel: BuyerChannelId,
): Promise<CatalogSnapshotPayload | null> {
  const cached = isolateCache.get(channel);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const raw = await kv.get(catalogSnapshotKey(channel), 'json');
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw as CatalogSnapshotPayload;
  if (!Array.isArray(payload.products)) return null;

  isolateCache.set(channel, {
    payload,
    expiresAt: Date.now() + ISOLATE_CACHE_TTL_MS,
  });
  return payload;
}

export async function writeCatalogSnapshot(
  kv: KVNamespace,
  channel: BuyerChannelId,
  products: ProductFacts[],
): Promise<void> {
  const body: CatalogSnapshotPayload = {
    schemaVersion: CATALOG_SNAPSHOT_SCHEMA_VERSION,
    fetchedAt: new Date().toISOString(),
    channel,
    products,
  };
  await kv.put(catalogSnapshotKey(channel), JSON.stringify(body));
  isolateCache.set(channel, {
    payload: body,
    expiresAt: Date.now() + ISOLATE_CACHE_TTL_MS,
  });
}
