/**
 * Odświeżanie migawek katalogu GE / GK → GEMMA_RUNTIME_KV.
 * Wywoływane z handlera scheduled (cron).
 */
import type {BuyerChannelId} from '../buyer/channel-switch';
import type {Env} from '../config/bindings';
import {fetchGeCatalogProducts} from './fetch-ge';
import {fetchGkCatalogProducts} from './fetch-gk';
import {invalidateCatalogSnapshotCache, writeCatalogSnapshot} from './snapshot';
import type {ProductFacts} from './types';

/** Soft limit poniżej hard 25 MiB KV — powyżej logujemy ostrzeżenie i i tak zapisujemy. */
const KV_WARN_BYTES = 20 * 1024 * 1024;

export type RefreshResult = {
  channel: BuyerChannelId;
  ok: boolean;
  productCount?: number;
  bytes?: number;
  reason?: string;
};

async function putSnapshot(
  env: Env,
  channel: BuyerChannelId,
  products: ProductFacts[],
): Promise<RefreshResult> {
  if (!env.GEMMA_RUNTIME_KV) {
    return {channel, ok: false, reason: 'no_kv_binding'};
  }
  const bytes = new TextEncoder().encode(JSON.stringify({products})).length;
  if (bytes > KV_WARN_BYTES) {
    console.warn(
      JSON.stringify({
        tag: 'facts.snapshot_size_warn',
        channel,
        bytes,
        products: products.length,
      }),
    );
  }
  await writeCatalogSnapshot(env.GEMMA_RUNTIME_KV, channel, products);
  invalidateCatalogSnapshotCache(channel);
  console.log(
    JSON.stringify({
      tag: 'facts.snapshot_written',
      channel,
      products: products.length,
      bytes,
    }),
  );
  return {channel, ok: true, productCount: products.length, bytes};
}

export async function refreshGeSnapshot(env: Env): Promise<RefreshResult> {
  const channel: BuyerChannelId = 'epir-online-store';
  try {
    if (!env.GEMMA_RUNTIME_KV) return {channel, ok: false, reason: 'no_kv_binding'};
    if (!env.SHOPIFY_ADMIN_TOKEN?.trim()) {
      return {channel, ok: false, reason: 'no_admin_token'};
    }
    const products = await fetchGeCatalogProducts(env);
    return putSnapshot(env, channel, products);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({tag: 'facts.refresh_ge_error', reason}));
    return {channel, ok: false, reason: 'fetch_error'};
  }
}

export async function refreshGkSnapshot(env: Env): Promise<RefreshResult> {
  const channel: BuyerChannelId = 'kazka-hydrogen';
  try {
    if (!env.GEMMA_RUNTIME_KV) return {channel, ok: false, reason: 'no_kv_binding'};
    if (!env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA?.trim()) {
      return {channel, ok: false, reason: 'no_token'};
    }
    const products = await fetchGkCatalogProducts(env);
    return putSnapshot(env, channel, products);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({tag: 'facts.refresh_gk_error', reason}));
    return {channel, ok: false, reason: 'fetch_error'};
  }
}

/** Osobno GE (Admin) i GK (Storefront) — bez mieszania źródeł. */
export async function refreshAllCatalogSnapshots(env: Env): Promise<RefreshResult[]> {
  const ge = await refreshGeSnapshot(env);
  const gk = await refreshGkSnapshot(env);
  return [ge, gk];
}
