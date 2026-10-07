import type {BuyerChannelId} from '../buyer/channel-switch';
import type {Env} from '../config/bindings';
import type {CatalogFactsRepository} from './types';
import {snapshotRepositoryFromKv} from './repository-kv';

function emptyFacets() {
  return {
    total: 0,
    byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0} as Record<
      string,
      number
    >,
    byStone: {},
    byMetal: {},
    byProductType: {},
  };
}

/**
 * Repozytorium GK — wyłącznie Storefront API z tokenem KAZKA (bez Admin, bez fallbacku).
 * URL produktu pochodzi z migawki zbudowanej z `STOREFRONTS.kazka.productUrlTemplate`.
 */
export async function createKazkaCatalogRepository(env: Env): Promise<CatalogFactsRepository> {
  const channel: BuyerChannelId = 'kazka-hydrogen';
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
  return snapshotRepositoryFromKv(env.GEMMA_RUNTIME_KV, 'kazka-hydrogen', channel);
}
