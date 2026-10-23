import type {BuyerChannelId} from '../buyer/channel-switch';
import type {Env} from '../config/bindings';
import {
  CatalogMcpLiveSearchError,
  CatalogMcpTransportEmptyError,
  emptyCatalogFacets,
  executeCatalogMcpLiveSearch,
} from './catalog-mcp-live';
import {
  fetchProductFactsByHandle,
  fetchProductFactsForVariantIds,
  fetchProductFactsLive,
  hasStorefrontCatalogToken,
  type FetchStorefrontLiveOptions,
} from './storefront-live';
import type {
  CatalogFactsRepository,
  CatalogFilters,
  ProductFacts,
} from './types';

export {
  brandForCatalogChannel,
  emptyCatalogFacets,
  executeCatalogMcpLiveSearch,
  parseMcpErrorCode,
  parseUcpSearchProductIds,
  parseUcpSearchProductRefs,
  extractHandleFromUcpProduct,
  CatalogMcpLiveSearchError,
  CatalogMcpTransportEmptyError,
} from './catalog-mcp-live';
export type {CatalogMcpLiveSearchOptions, UcpSearchProductRef} from './catalog-mcp-live';

export async function getCatalogRepository(
  env: Env,
  channel: BuyerChannelId,
  options?: FetchStorefrontLiveOptions,
): Promise<CatalogFactsRepository> {
  const facetsEmpty = emptyCatalogFacets();

  return {
    channel,
    status: async () => {
      if (!hasStorefrontCatalogToken(env, channel)) {
        return {available: false, reason: 'no_token'};
      }
      return {available: true, fetchedAt: new Date().toISOString()};
    },
    search: async (filters: CatalogFilters, limit: number) => {
      try {
        return await executeCatalogMcpLiveSearch(env, channel, filters, limit, {
          ...options,
          throwOnMcpError: options?.throwOnMcpError ?? false,
        });
      } catch (err) {
        if (
          options?.throwOnMcpError &&
          (err instanceof CatalogMcpLiveSearchError || err instanceof CatalogMcpTransportEmptyError)
        ) {
          throw err;
        }
        console.warn(
          JSON.stringify({
            tag: 'facts.repository_live_search_error',
            channel,
            reason: err instanceof Error ? err.message : String(err),
          }),
        );
        return {matches: [], total: 0, facets: facetsEmpty};
      }
    },
    getById: async (productId: string) => {
      try {
        if (!hasStorefrontCatalogToken(env, channel)) return null;
        const facts = await fetchProductFactsLive(env, channel, [productId], options);
        return facts[0] ?? null;
      } catch (err) {
        console.warn(
          JSON.stringify({
            tag: 'facts.repository_live_get_by_id_error',
            channel,
            reason: err instanceof Error ? err.message : String(err),
          }),
        );
        return null;
      }
    },
  };
}

export {buildUcpSearchCatalogArgs, CATALOG_SEARCH_SERVER_LIMIT, parseUcpFilterIgnoredMessages} from './catalog-ucp-args';
export {formatMatchBlock, formatProductsBlock, PAGE_PRODUCT_HEADER} from './format-product-block';
export {normalizeProduct} from './normalize';
export {
  extractHandlesFromSuggestJson,
  fetchShopSuggestProductHandles,
  handleFromProductPath,
} from './shop-suggest';
export {
  fetchProductFactsByHandle,
  fetchProductFactsForVariantIds,
  searchStorefrontProductRefsByQuery,
} from './storefront-live';
export type {StorefrontProductSearchRef} from './storefront-live';
export type {
  ProductFacts,
  VariantFacts,
  CatalogFilters,
  ProductMatch,
  DataIssue,
  CatalogFactsRepository,
  BuyerChannelId,
} from './types';
