import {resolveUrlForChannel} from '../../buyer/channel-origins';
import {searchGemmaCatalog} from '../facts/catalog-search';
import type {GemmaActionContext, GemmaCatalogCard} from './types';
import {
  GEMMA_CATALOG_DISPLAY_LIMIT,
  GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT,
} from './catalog-limits';
import {isQualitativeBudget, slotsToCatalogFilters, sortMatchesByMinVariantPrice} from './slots-to-filters';
import type {GemmaShownRef} from '../state/types';

export async function runCatalogAction(ctx: GemmaActionContext): Promise<{
  cards: GemmaCatalogCard[];
  shown: GemmaShownRef[];
}> {
  const slots = ctx.transitioned.slots;
  const qualitative = isQualitativeBudget(slots, ctx.userCorpus);
  const filters = slotsToCatalogFilters(slots, ctx.userCorpus);
  const fetchLimit = qualitative ? GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT : GEMMA_CATALOG_DISPLAY_LIMIT;

  const matches = await searchGemmaCatalog(
    ctx.env,
    ctx.channelId,
    filters,
    fetchLimit,
    ctx.request,
  );

  const sorted = sortMatchesByMinVariantPrice(matches, qualitative);
  const top = sorted.slice(0, GEMMA_CATALOG_DISPLAY_LIMIT);

  const cards: GemmaCatalogCard[] = [];
  const shown: GemmaShownRef[] = [];
  let idx = 1;
  for (const {match, minMinor} of top) {
    const ref = `g${idx++}`;
    const handle = match.product.handle;
    const url =
      match.product.url?.trim() ||
      resolveUrlForChannel(`/products/${handle}`, ctx.channelId) ||
      `/products/${handle}`;
    const variantIds = (match.matchingVariants.length
      ? match.matchingVariants
      : match.product.variants
    ).map((v) => v.variantId || v.variant_id || '').filter(Boolean);
    cards.push({ref, match, minMinor});
    shown.push({
      ref,
      productId: match.product.productId,
      handle,
      variantIds,
      url,
    });
  }
  return {cards, shown};
}
