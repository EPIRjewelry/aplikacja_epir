import type {BuyerChannelId} from '../buyer/channel-switch';
import type {Env} from '../config/bindings';
import {callMcpToolDirect} from '../mcp_server';
import {buildUcpSearchCatalogArgs, parseUcpFilterIgnoredMessages} from './catalog-ucp-args';
import {computeFacetsFromMatches, filterProducts} from './filter';
import {
  fetchProductFactsByHandle,
  fetchProductFactsLive,
  hasStorefrontCatalogToken,
  type FetchStorefrontLiveOptions,
} from './storefront-live';
import type {
  CatalogFactsRepository,
  CatalogFacetsDto,
  CatalogFilters,
  CatalogSearchResult,
  ProductFacts,
} from './types';

function emptyFacets(): CatalogFacetsDto {
  return {
    total: 0,
    byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
    byStone: {},
    byMetal: {},
    byProductType: {},
  };
}

function brandForChannel(channel: BuyerChannelId): string {
  if (channel === 'kazka-hydrogen') return 'kazka';
  if (channel === 'epir-zareczyny') return 'zareczyny';
  return 'epir';
}

function parseUcpSearchProductIds(mcpOut: unknown): string[] {
  const wrapped = mcpOut as {
    error?: unknown;
    result?: {content?: Array<{text?: string}>};
  };
  if (wrapped.error) return [];
  const text = wrapped.result?.content?.[0]?.text;
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as {
      products?: Array<{id?: string}>;
      catalog?: {products?: Array<{id?: string}>};
    };
    const products =
      (Array.isArray(parsed.products) && parsed.products) ||
      (Array.isArray(parsed.catalog?.products) && parsed.catalog.products) ||
      [];
    const ids: string[] = [];
    for (const p of products) {
      if (typeof p?.id === 'string' && p.id.includes('/Product/')) ids.push(p.id);
    }
    return ids;
  } catch {
    return [];
  }
}

export async function getCatalogRepository(
  env: Env,
  channel: BuyerChannelId,
  options?: FetchStorefrontLiveOptions,
): Promise<CatalogFactsRepository> {
  const facetsEmpty = emptyFacets();

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
        if (!hasStorefrontCatalogToken(env, channel)) {
          return {matches: [], total: 0, facets: facetsEmpty};
        }
        const brand = brandForChannel(channel);
        const mcpArgs = buildUcpSearchCatalogArgs(filters, limit);
        const mcpOut = await callMcpToolDirect(env, 'search_catalog', mcpArgs, brand);
        const filterIgnored = parseUcpFilterIgnoredMessages(mcpOut);
        const ids = parseUcpSearchProductIds(mcpOut);
        if (!ids.length) {
          return {
            matches: [],
            total: 0,
            facets: facetsEmpty,
            meta: filterIgnored.length ? {filterIgnored} : undefined,
          };
        }
        const facts = await fetchProductFactsLive(env, channel, ids, options);
        const postUcpFilters = {...filters, text: undefined, priceMin: undefined, priceMax: undefined};
        const matches = filterProducts(facts, postUcpFilters);
        const result: CatalogSearchResult = {
          matches,
          total: matches.length,
          facets: computeFacetsFromMatches(matches),
        };
        if (filterIgnored.length) result.meta = {filterIgnored};
        return result;
      } catch (err) {
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
export {fetchProductFactsByHandle} from './storefront-live';
export type {
  ProductFacts,
  VariantFacts,
  CatalogFilters,
  ProductMatch,
  DataIssue,
  CatalogFactsRepository,
  BuyerChannelId,
} from './types';
