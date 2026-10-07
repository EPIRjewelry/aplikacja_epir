import type {BuyerChannelId} from '../buyer/channel-switch';
import {filterProducts, computeFacetsFromMatches} from './filter';
import type {
  CatalogFactsRepository,
  CatalogFacets,
  CatalogFilters,
  ProductFacts,
  ProductMatch,
} from './types';
import {readCatalogSnapshot} from './snapshot';

export async function snapshotRepositoryFromKv(
  kv: KVNamespace,
  channel: BuyerChannelId,
): Promise<CatalogFactsRepository> {
  const snapshot = await readCatalogSnapshot(kv, channel);
  const products = snapshot?.products ?? [];
  const fetchedAt = snapshot?.fetchedAt;

  return {
    channel,
    status: async () =>
      products.length
        ? {available: true, fetchedAt}
        : {available: false, reason: 'no_snapshot'},
    search: async (filters: CatalogFilters, limit: number) => {
      const matches = filterProducts(products, filters).slice(0, Math.max(1, limit));
      const facets = computeFacetsFromMatches(matches);
      const total = filterProducts(products, filters).length;
      return {matches, total, facets};
    },
    facets: async (filters: CatalogFilters = {}) => {
      const matches = filterProducts(products, filters);
      return computeFacetsFromMatches(matches);
    },
    getById: async (productId: string) =>
      products.find((p) => p.product_id === productId) ?? null,
    getByHandle: async (handle: string) =>
      products.find((p) => p.handle === handle) ?? null,
  };
}
