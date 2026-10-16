import {resolveUrlForChannel} from '../../buyer/channel-origins';
import {searchGemmaCatalog} from '../facts/catalog-search';
import type {GemmaActionContext, GemmaCatalogCard} from './types';
import {slotsToCatalogFilters, sortMatchesByMinVariantPrice} from './slots-to-filters';
import type {GemmaShownRef} from '../state/types';

const CATALOG_LIMIT = 6;

export async function runCatalogAction(ctx: GemmaActionContext): Promise<{
  cards: GemmaCatalogCard[];
  shown: GemmaShownRef[];
}> {
  const filters = slotsToCatalogFilters(ctx.transitioned.slots, ctx.userCorpus);
  const matches = await searchGemmaCatalog(
    ctx.env,
    ctx.channelId,
    filters,
    CATALOG_LIMIT,
    ctx.request,
  );
  const sorted = sortMatchesByMinVariantPrice(matches);
  const cards: GemmaCatalogCard[] = [];
  const shown: GemmaShownRef[] = [];
  let idx = 1;
  for (const {match, minMinor} of sorted) {
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
