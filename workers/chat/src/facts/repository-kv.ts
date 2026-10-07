import type {BuyerChannelId} from '../buyer/channel-switch';
import {filterProducts, computeFacetsFromMatches} from './filter';
import type {CatalogFactsRepository, CatalogFilters} from './types';
import {readCatalogSnapshot} from './snapshot';

/**
 * @param snapshotChannel — klucz KV (GE lub GK)
 * @param logicalChannel — kanał repozytorium (np. epir-zareczyny czyta migawkę GE)
 */
export async function snapshotRepositoryFromKv(
  kv: KVNamespace,
  snapshotChannel: 'epir-online-store' | 'kazka-hydrogen',
  logicalChannel: BuyerChannelId = snapshotChannel,
): Promise<CatalogFactsRepository> {
  const snapshot = await readCatalogSnapshot(kv, snapshotChannel);
  const products = snapshot?.products ?? [];
  const fetchedAt = snapshot?.fetchedAt;

  return {
    channel: logicalChannel,
    status: async () =>
      products.length
        ? {available: true, fetchedAt}
        : {available: false, reason: 'no_snapshot'},
    search: async (filters: CatalogFilters, limit: number) => {
      const all = filterProducts(products, filters);
      const matches = all.slice(0, Math.max(1, limit));
      return {matches, total: all.length, facets: computeFacetsFromMatches(matches)};
    },
    facets: async (filters: CatalogFilters = {}) => {
      const matches = filterProducts(products, filters);
      return computeFacetsFromMatches(matches);
    },
    getById: async (productId: string) =>
      products.find((p) => p.productId === productId || p.product_id === productId) ?? null,
    getByHandle: async (handle: string) =>
      products.find((p) => p.handle === handle) ?? null,
  };
}
