import type {BuyerChannelId} from '../buyer/channel-switch';
import type {Env} from '../config/bindings';
import {resolveStorefrontConfig} from '../config/storefronts';
import type {CatalogFactsRepository} from './types';
import {snapshotRepositoryFromKv} from './repository-kv';

/**
 * Repozytorium GK — wyłącznie Storefront API z tokenem KAZKA (bez Admin, bez fallbacku).
 */
export async function createKazkaCatalogRepository(env: Env): Promise<CatalogFactsRepository> {
  const channel: BuyerChannelId = 'kazka-hydrogen';
  const cfg = resolveStorefrontConfig(env, 'kazka');
  const token = env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA?.trim();
  if (!token) {
    return {
      channel,
      status: async () => ({available: false, reason: 'no_token'}),
      search: async () => ({matches: [], total: 0, facets: emptyFacets()}),
      facets: async () => emptyFacets(),
      getById: async () => null,
      getByHandle: async () => null,
    };
  }
  if (!env.GEMMA_RUNTIME_KV) {
    return {
      channel,
      status: async () => ({available: false, reason: 'no_snapshot'}),
      search: async () => ({matches: [], total: 0, facets: emptyFacets()}),
      facets: async () => emptyFacets(),
      getById: async () => null,
      getByHandle: async () => null,
    };
  }
  void cfg;
  const repo = await snapshotRepositoryFromKv(env.GEMMA_RUNTIME_KV, channel);
  return repo;
}

function emptyFacets() {
  return {
    total: 0,
    byOrigin: {} as Record<string, number>,
    byStone: {},
    byMetal: {},
    byProductType: {},
  };
}
