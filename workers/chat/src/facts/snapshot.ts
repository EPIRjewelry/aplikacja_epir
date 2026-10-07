import type {BuyerChannelId} from '../buyer/channel-switch';
import type {ProductFacts} from './types';

export const CATALOG_SNAPSHOT_SCHEMA_VERSION = 1;

export type CatalogSnapshotPayload = {
  schemaVersion: number;
  fetchedAt: string;
  channel: BuyerChannelId;
  products: ProductFacts[];
};

export function catalogSnapshotKey(channel: BuyerChannelId): string {
  return `catalog:v1:${channel}`;
}

export async function readCatalogSnapshot(
  kv: KVNamespace,
  channel: BuyerChannelId,
): Promise<CatalogSnapshotPayload | null> {
  const raw = await kv.get(catalogSnapshotKey(channel), 'json');
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw as CatalogSnapshotPayload;
  if (!Array.isArray(payload.products)) return null;
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
}
