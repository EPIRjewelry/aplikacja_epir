import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {Env} from '../../config/bindings';
import {
  GEMMA_CATALOG_DISPLAY_LIMIT,
  GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT,
} from '../actions/catalog-limits';
import {
  attachMinMinorToMatches,
  isLuxuryQualitativeBudget,
  isQualitativeBudget,
  isTanioQualitativeBudget,
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
  const qualitative = isQualitativeBudget(params.slots);
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
  let priced: import('./catalog-search').GemmaCatalogPricedMatch[];
  if (qualitative && isLuxuryQualitativeBudget(params.slots)) {
    priced = sortMatchesByMinVariantPrice(matches, false);
  } else if (qualitative && isTanioQualitativeBudget(params.slots)) {
    priced = sortMatchesByMinVariantPrice(matches, true);
  } else {
    priced = attachMinMinorToMatches(matches);
  }
  return priced.slice(0, GEMMA_CATALOG_DISPLAY_LIMIT);
}
