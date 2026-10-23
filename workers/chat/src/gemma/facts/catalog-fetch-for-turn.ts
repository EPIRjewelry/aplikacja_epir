import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {Env} from '../../config/bindings';
import type {MoneyPln} from '../../facts/types';
import {
  GEMMA_CATALOG_DISPLAY_LIMIT,
  GEMMA_FACETED_CATALOG_FETCH_LIMIT,
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
import {isCustomOrderProductType} from '../state/machine';
import type {GemmaSlots} from '../state/types';
import {
  searchGemmaCatalog,
  type GemmaCatalogPricedMatch,
  type GemmaCatalogSearchMeta,
} from './catalog-search';

function priceMinorOf(v: MoneyPln | number | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return v.minor ?? v.amount_minor;
}

/** PT ∧ metal ∧ stone — pełniejszy UCP fetch (S3 facet query). */
export function slotsHaveProductTypeMetalAndStone(slots: GemmaSlots): boolean {
  const pt = slots.product_type?.trim();
  if (!pt || isCustomOrderProductType(pt)) return false;
  if (!slots.metal?.trim()) return false;
  if (!slots.stone?.trim()) return false;
  return true;
}

export function resolveGemmaCatalogFetchLimit(slots: GemmaSlots, qualitativeBrowse: boolean): number {
  if (qualitativeBrowse) return GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT;
  if (slotsHaveProductTypeMetalAndStone(slots)) return GEMMA_FACETED_CATALOG_FETCH_LIMIT;
  return GEMMA_CATALOG_DISPLAY_LIMIT;
}

/** Prefer variants closest to priceMax (under budget) — 340 bliżej 340 niż 320. */
export function sortMatchesClosestToPriceMax(
  priced: GemmaCatalogPricedMatch[],
  priceMaxMinor: number,
): GemmaCatalogPricedMatch[] {
  return [...priced].sort((a, b) => {
    const da = Math.abs(a.minMinor - priceMaxMinor);
    const db = Math.abs(b.minMinor - priceMaxMinor);
    if (da !== db) return da - db;
    return a.minMinor - b.minMinor;
  });
}

/**
 * When suggest path ran: site rank first, then closest-to-priceMax among ties / non-suggest.
 * Avoids „do 400 zł” display favoring 380 over suggest #3 @340.
 */
export function sortMatchesWithSuggestRankThenPriceMax(
  priced: GemmaCatalogPricedMatch[],
  priceMaxMinor: number,
  suggestHandlesRanked: string[],
): GemmaCatalogPricedMatch[] {
  if (!suggestHandlesRanked.length) {
    return sortMatchesClosestToPriceMax(priced, priceMaxMinor);
  }
  const rankByHandle = new Map<string, number>();
  suggestHandlesRanked.forEach((h, i) => rankByHandle.set(h, i));
  const tailRank = suggestHandlesRanked.length;

  return [...priced].sort((a, b) => {
    const ha = a.match.product.handle?.trim() ?? '';
    const hb = b.match.product.handle?.trim() ?? '';
    const ra = rankByHandle.has(ha) ? rankByHandle.get(ha)! : tailRank;
    const rb = rankByHandle.has(hb) ? rankByHandle.get(hb)! : tailRank;
    if (ra !== rb) return ra - rb;
    const da = Math.abs(a.minMinor - priceMaxMinor);
    const db = Math.abs(b.minMinor - priceMaxMinor);
    if (da !== db) return da - db;
    return a.minMinor - b.minMinor;
  });
}

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
  const fetchLimit = resolveGemmaCatalogFetchLimit(params.slots, browseQualitative);
  const searchMeta: GemmaCatalogSearchMeta = {};
  const matches = await searchGemmaCatalog(
    params.env,
    params.channelId,
    filters,
    fetchLimit,
    params.clientRequest,
    searchMeta,
  );
  let priced: GemmaCatalogPricedMatch[];
  if (qualitative && isLuxuryQualitativeBudget(params.slots)) {
    priced = sortMatchesByMinVariantPrice(matches, false);
  } else if (qualitative && isTanioQualitativeBudget(params.slots)) {
    priced = sortMatchesByMinVariantPrice(matches, true);
  } else {
    priced = attachMinMinorToMatches(matches);
    const maxMinor = priceMinorOf(filters.priceMax);
    if (typeof maxMinor === 'number' && Number.isFinite(maxMinor)) {
      const suggestRanked = searchMeta.suggestHandlesRanked;
      if (suggestRanked?.length) {
        priced = sortMatchesWithSuggestRankThenPriceMax(priced, maxMinor, suggestRanked);
      } else {
        priced = sortMatchesClosestToPriceMax(priced, maxMinor);
      }
    }
  }
  return priced.slice(0, GEMMA_CATALOG_DISPLAY_LIMIT);
}
