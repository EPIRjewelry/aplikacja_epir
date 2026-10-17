import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {Env} from '../../config/bindings';
import {
  GEMMA_CATALOG_DISPLAY_LIMIT,
  GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT,
} from '../actions/catalog-limits';
import {
  isLuxuryQualitativeBudget,
  isQualitativeBudget,
  slotsToCatalogFilters,
  sortMatchesByMinVariantPrice,
} from '../actions/slots-to-filters';
import type {GemmaSlots} from '../state/types';
import {searchGemmaCatalog} from './catalog-search';
import type {GemmaCatalogPricedMatch} from './catalog-search';

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
  const browseQualitative = qualitative && Boolean(filters.ucpBrowseInStockAvailable);
  const fetchLimit = browseQualitative
    ? GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT
    : GEMMA_CATALOG_DISPLAY_LIMIT;
  const matches = await searchGemmaCatalog(
    params.env,
    params.channelId,
    filters,
    fetchLimit,
    params.clientRequest,
  );
  const sortAscending = !isLuxuryQualitativeBudget(params.slots);
  const sorted = sortMatchesByMinVariantPrice(matches, sortAscending);
  return sorted.slice(0, GEMMA_CATALOG_DISPLAY_LIMIT);
}
