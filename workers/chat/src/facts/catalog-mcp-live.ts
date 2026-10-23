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

export type UcpSearchProductRef = {
  id: string;
  handle?: string;
};

function handleFromProductUrl(value: string): string | undefined {
  const m = value.match(/\/products\/([^/?#]+)/i);
  if (!m?.[1]) return undefined;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function extractHandleFromUcpProduct(p: {
  handle?: unknown;
  link?: unknown;
  url?: unknown;
  onlineStoreUrl?: unknown;
  online_store_url?: unknown;
}): string | undefined {
  if (typeof p.handle === 'string' && p.handle.trim()) return p.handle.trim();
  for (const key of ['link', 'url', 'onlineStoreUrl', 'online_store_url'] as const) {
    const v = p[key];
    if (typeof v === 'string' && v.trim()) {
      const h = handleFromProductUrl(v.trim());
      if (h) return h;
    }
  }
  return undefined;
}

/** UCP search_catalog → product refs (GID + optional handle for Storefront hydrate). */
export function parseUcpSearchProductRefs(mcpOut: unknown): UcpSearchProductRef[] {
  const wrapped = mcpOut as {
    error?: unknown;
    result?: {content?: Array<{text?: string}>};
  };
  if (wrapped.error) return [];
  const text = wrapped.result?.content?.[0]?.text;
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as {
      products?: Array<Record<string, unknown>>;
      catalog?: {products?: Array<Record<string, unknown>>};
    };
    const products =
      (Array.isArray(parsed.products) && parsed.products) ||
      (Array.isArray(parsed.catalog?.products) && parsed.catalog.products) ||
      [];
    const out: UcpSearchProductRef[] = [];
    const seen = new Set<string>();
    for (const p of products) {
      const id = typeof p?.id === 'string' ? p.id : '';
      if (!id.includes('/Product/') || seen.has(id)) continue;
      seen.add(id);
      const handle = extractHandleFromUcpProduct(p);
      out.push(handle ? {id, handle} : {id});
    }
    return out;
  } catch {
    return [];
  }
}

/** Ids only — prefer parseUcpSearchProductRefs when handle hydrate is needed. */
export function parseUcpSearchProductIds(mcpOut: unknown): string[] {
  return parseUcpSearchProductRefs(mcpOut).map((r) => r.id);
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
  const refs = parseUcpSearchProductRefs(mcpOut);
  const ids = refs.map((r) => r.id);
  const productHandlesById: Record<string, string> = {};
  for (const r of refs) {
    if (r.handle?.trim()) productHandlesById[r.id] = r.handle.trim();
  }
  const logStages = Boolean(options?.throwOnMcpError);
  const metalFilterActive = Boolean(filters.metal?.length);
  const stoneFilterActive = Boolean(filters.stone?.length);
  if (logStages) {
    console.log(
      JSON.stringify({
        tag: 'gemma.catalog.stage',
        stage: 'ucp_ids',
        ucp_ids: ids.length,
        ucp_handles: Object.keys(productHandlesById).length,
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

  const hydrationStats = {
    null_nodes: 0,
    normalize_null: 0,
    no_url: 0,
    null_id: 0,
    id_fallback_ok: 0,
    handle_fallback_ok: 0,
  };
  const facts = await fetchProductFactsLive(env, channel, ids, {
    ...options,
    hydrationStats,
    productHandlesById,
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
        null_id: hydrationStats.null_id,
        id_fallback_ok: hydrationStats.id_fallback_ok,
        handle_fallback_ok: hydrationStats.handle_fallback_ok,
      }),
    );
  }
  // UCP transport: query + price only. Metal/stone use exact taxonomy labels post-hydration
  // (see metal-match.ts / ProductFilter docs on shopify.dev — not sent as MCP facet filters).
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
