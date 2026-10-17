import {resolveUrlForChannel} from '../../buyer/channel-origins';
import {fetchGemmaCatalogMatchesForTurn} from '../facts/catalog-search';
import type {GemmaActionContext, GemmaCatalogCard} from './types';
import type {GemmaShownRef} from '../state/types';

export async function runCatalogAction(ctx: GemmaActionContext): Promise<{
  cards: GemmaCatalogCard[];
  shown: GemmaShownRef[];
}> {
  const top = await fetchGemmaCatalogMatchesForTurn({
    env: ctx.env,
    channelId: ctx.channelId,
    slots: ctx.transitioned.slots,
    userCorpus: ctx.userCorpus,
    clientRequest: ctx.request,
  });

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
