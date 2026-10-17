import {catalogSnapshotChannel} from '../../buyer/channel-switch';
import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {Env} from '../../config/bindings';
import {CatalogMcpSearchError} from '../../facts/catalog-mcp-error';
import {getCatalogRepository} from '../../facts';
import {filterProducts} from '../../facts/filter';
import type {ProductMatch} from '../../facts/types';
import {filterProductMatchesByZareczynyTag} from './assortment';
import type {GemmaCatalogSearchFilters} from './types';
import {
  GEMMA_CATALOG_DISPLAY_LIMIT,
  GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT,
} from '../actions/catalog-limits';
import {
  isQualitativeBudget,
  slotsToCatalogFilters,
  sortMatchesByMinVariantPrice,
} from '../actions/slots-to-filters';
import type {GemmaSlots} from '../state/types';

export type GemmaCatalogPricedMatch = {match: ProductMatch; minMinor: number};

/** Jedyna ścieżka v2: filtry, limit UCP, sort po cenie, slice do wyświetlenia. */
export async function fetchGemmaCatalogMatchesForTurn(params: {
  env: Env;
  channelId: BuyerChannelId;
  slots: GemmaSlots;
  userCorpus: string;
  clientRequest?: Request;
}): Promise<GemmaCatalogPricedMatch[]> {
  const qualitative = isQualitativeBudget(params.slots, params.userCorpus);
  const filters = slotsToCatalogFilters(params.slots, params.userCorpus);
  const fetchLimit = qualitative ? GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT : GEMMA_CATALOG_DISPLAY_LIMIT;
  const matches = await searchGemmaCatalog(
    params.env,
    params.channelId,
    filters,
    fetchLimit,
    params.clientRequest,
  );
  const sorted = sortMatchesByMinVariantPrice(matches, qualitative);
  return sorted.slice(0, GEMMA_CATALOG_DISPLAY_LIMIT);
}

export async function searchGemmaCatalog(
  env: Env,
  channelId: BuyerChannelId,
  filters: GemmaCatalogSearchFilters,
  limit: number,
  clientRequest?: Request,
): Promise<ProductMatch[]> {
  const started = Date.now();
  const catalogChannel = catalogSnapshotChannel(channelId);
  const repo = await getCatalogRepository(env, catalogChannel, {
    clientRequest,
    urlChannel: channelId,
    gemmaCatalogMcpErrors: true,
  });

  const {priceMin, priceMax, text, ucpIntent, metal, stone, ucpBrowseInStockAvailable, available} =
    filters;

  try {
    const {matches} = await repo.search(
      {
        text,
        ucpIntent,
        metal,
        stone,
        priceMin,
        priceMax,
        available,
        ucpBrowseInStockAvailable,
      },
      limit,
    );

    let out: ProductMatch[] = matches;
    if (priceMin !== undefined || priceMax !== undefined) {
      const products = matches.map((m) => m.product);
      out = filterProducts(products, {metal, stone, priceMin, priceMax});
    }

    const result = await filterProductMatchesByZareczynyTag(env, channelId, out, clientRequest);

    console.log(
      JSON.stringify({
        tag: 'gemma.catalog',
        match_count: result.length,
        fetch_limit: limit,
        browse: Boolean(ucpBrowseInStockAvailable),
        has_text_query: Boolean(text?.trim()),
        duration_ms: Date.now() - started,
      }),
    );

    return result;
  } catch (e) {
    if (e instanceof CatalogMcpSearchError) {
      console.log(JSON.stringify({tag: 'gemma.catalog.error', code: e.mcpCode}));
    }
    throw e;
  }
}
