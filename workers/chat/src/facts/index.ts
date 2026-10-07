import type {BuyerChannelId} from '../buyer/channel-switch';
import type {Env} from '../config/bindings';
import {createKazkaCatalogRepository} from './gk-repository';
import {snapshotRepositoryFromKv} from './repository-kv';
import type {CatalogFactsRepository} from './types';

function unavailableRepo(
  channel: BuyerChannelId,
  reason: 'no_token' | 'no_snapshot' | 'fetch_error',
): CatalogFactsRepository {
  const empty = {
    total: 0,
    byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
    byStone: {},
    byMetal: {},
    byProductType: {},
  };
  return {
    channel,
    status: async () => ({available: false, reason}),
    search: async () => ({matches: [], total: 0, facets: empty}),
    facets: async () => empty,
    getById: async () => null,
    getByHandle: async () => null,
  };
}

export async function getCatalogRepository(
  env: Env,
  channel: BuyerChannelId,
): Promise<CatalogFactsRepository> {
  if (channel === 'kazka-hydrogen') {
    return createKazkaCatalogRepository(env);
  }
  if (!env.GEMMA_RUNTIME_KV) {
    return unavailableRepo('epir-online-store', 'no_snapshot');
  }
  const repo = await snapshotRepositoryFromKv(env.GEMMA_RUNTIME_KV, 'epir-online-store');
  const status = await repo.status();
  if (!status.available) {
    return unavailableRepo('epir-online-store', status.reason ?? 'no_snapshot');
  }
  return repo;
}

export {normalizeProduct} from './normalize';
export type {
  ProductFacts,
  VariantFacts,
  CatalogFilters,
  ProductMatch,
  DataIssue,
  CatalogFactsRepository,
} from './types';
