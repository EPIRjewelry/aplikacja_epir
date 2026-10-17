import type {BuyerChannelId} from '../buyer/channel-switch';
import type {Env} from '../config/bindings';
import {callMcpToolDirect} from '../mcp_server';
import {buildUcpSearchCatalogArgs, parseUcpFilterIgnoredMessages} from './catalog-ucp-args';
import {computeFacetsFromMatches, filterProducts} from './filter';
import {
  fetchProductFactsLive,
  hasStorefrontCatalogToken,
  type FetchStorefrontLiveOptions,
} from './storefront-live';
import type {CatalogFacetsDto, CatalogFilters, CatalogSearchResult} from './types';

export class CatalogMcpLiveSearchError extends Error {
  readonly mcpCode: number;

  constructor(mcpCode: number) {
    super('catalog_mcp_search_error');
    this.name = 'CatalogMcpLiveSearchError';
    this.mcpCode = mcpCode;
  }
}

export function emptyCatalogFacets(): CatalogFacetsDto {
  return {
    total: 0,
    byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0},
    byStone: {},
    byMetal: {},
    byProductType: {},
  };
}

export function brandForCatalogChannel(channel: BuyerChannelId): string {
  if (channel === 'kazka-hydrogen') return 'kazka';
  if (channel === 'epir-zareczyny') return 'zareczyny';
  return 'epir';
}

export function parseMcpErrorCode(mcpOut: unknown): number | undefined {
  const wrapped = mcpOut as {error?: {code?: number}};
  const code = wrapped.error?.code;
  return typeof code === 'number' ? code : undefined;
}

export function parseUcpSearchProductIds(mcpOut: unknown): string[] {
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

export type CatalogMcpLiveSearchOptions = FetchStorefrontLiveOptions & {
  /** Gemma v2 (D3): rzuca zamiast pustej listy przy error.code z MCP. */
  throwOnMcpError?: boolean;
  /** Gemma v2 browse (D1). */
  browseInStockAvailable?: boolean;
};

export async function executeCatalogMcpLiveSearch(
  env: Env,
  channel: BuyerChannelId,
  filters: CatalogFilters,
  limit: number,
  options?: CatalogMcpLiveSearchOptions,
): Promise<CatalogSearchResult> {
  const facetsEmpty = emptyCatalogFacets();
  if (!hasStorefrontCatalogToken(env, channel)) {
    return {matches: [], total: 0, facets: facetsEmpty};
  }

  const brand = brandForCatalogChannel(channel);
  const mcpArgs = buildUcpSearchCatalogArgs(
    filters,
    limit,
    options?.browseInStockAvailable ? {browseInStockAvailable: true} : undefined,
  );
  const mcpOut = await callMcpToolDirect(env, 'search_catalog', mcpArgs, brand);
  const mcpCode = parseMcpErrorCode(mcpOut);
  if (mcpCode !== undefined) {
    if (options?.throwOnMcpError) {
      throw new CatalogMcpLiveSearchError(mcpCode);
    }
    return {matches: [], total: 0, facets: facetsEmpty};
  }

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
}
