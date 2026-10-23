import type {BuyerChannelId} from '../buyer/channel-switch';
import type {Env} from '../config/bindings';
import {callMcpToolDirect, isMcpCatalogTransportEmptyResult} from '../mcp_server';
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

/** Gemma v2: bezpieczny fallback MCP (CATALOG_EMPTY), nie pusty wynik wyszukiwania. */
export class CatalogMcpTransportEmptyError extends Error {
  constructor() {
    super('catalog_mcp_transport_empty');
    this.name = 'CatalogMcpTransportEmptyError';
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

  const rawResult = (mcpOut as {result?: unknown}).result;
  if (isMcpCatalogTransportEmptyResult(rawResult)) {
    if (options?.throwOnMcpError) {
      throw new CatalogMcpTransportEmptyError();
    }
    return {matches: [], total: 0, facets: facetsEmpty};
  }

  const filterIgnored = parseUcpFilterIgnoredMessages(mcpOut);
  const ids = [...new Set(parseUcpSearchProductIds(mcpOut))];
  const logStages = Boolean(options?.throwOnMcpError);
  const metalFilterActive = Boolean(filters.metal?.length);
  const stoneFilterActive = Boolean(filters.stone?.length);
  if (logStages) {
    console.log(
      JSON.stringify({
        tag: 'gemma.catalog.stage',
        stage: 'ucp_ids',
        ucp_ids: ids.length,
        filter_metal_active: metalFilterActive,
        filter_stone_active: stoneFilterActive,
        price_filter_active: Boolean(filters.priceMin ?? filters.priceMax),
      }),
    );
  }
  if (!ids.length) {
    return {
      matches: [],
      total: 0,
      facets: facetsEmpty,
      meta: filterIgnored.length ? {filterIgnored} : undefined,
    };
  }

  const hydrationStats = {null_nodes: 0, normalize_null: 0, no_url: 0};
  const facts = await fetchProductFactsLive(env, channel, ids, {
    ...options,
    hydrationStats,
  });
  if (logStages) {
    console.log(
      JSON.stringify({
        tag: 'gemma.catalog.stage',
        stage: 'facts_hydrated',
        ucp_ids: ids.length,
        facts_hydrated: facts.length,
        dropped_no_store_url: ids.length - facts.length,
        null_nodes: hydrationStats.null_nodes,
        normalize_null: hydrationStats.normalize_null,
        no_url: hydrationStats.no_url,
      }),
    );
  }
  const postUcpFilters = {...filters, text: undefined, priceMin: undefined, priceMax: undefined};
  if (logStages && (metalFilterActive || stoneFilterActive)) {
    console.log(
      JSON.stringify({
        tag: 'gemma.catalog.stage',
        stage: 'post_ucp_local_metal_stone',
        filter_metal_active: metalFilterActive,
        filter_stone_active: stoneFilterActive,
      }),
    );
  }
  const matches = filterProducts(facts, postUcpFilters);
  if (logStages) {
    console.log(
      JSON.stringify({
        tag: 'gemma.catalog.stage',
        stage: 'after_post_ucp_filter',
        after_post_ucp_filter: matches.length,
      }),
    );
  }
  const result: CatalogSearchResult = {
    matches,
    total: matches.length,
    facets: computeFacetsFromMatches(matches),
  };
  if (filterIgnored.length) result.meta = {filterIgnored};
  return result;
}
