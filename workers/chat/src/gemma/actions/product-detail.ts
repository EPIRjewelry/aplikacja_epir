import {catalogSnapshotChannel} from '../../buyer/channel-switch';
import {fetchProductFactsByHandle} from '../../facts';
import type {GemmaActionContext} from './types';
import type {GemmaShownRef} from '../state/types';

export async function runProductDetailAction(ctx: GemmaActionContext): Promise<{
  product: import('../../facts/types').ProductFacts | null;
  shownPatch: GemmaShownRef | null;
  selected: {productId: string; variantId: string | null};
}> {
  const catalogChannel = catalogSnapshotChannel(ctx.channelId);
  let handle = ctx.productHandle?.trim() || '';
  const ref = ctx.intent.product_ref?.trim();
  if (ref) {
    const fromShown = ctx.prev.shown.find((s) => s.ref === ref || s.handle === ref);
    if (fromShown) handle = fromShown.handle;
  }
  if (!handle) {
    return {product: null, shownPatch: null, selected: {productId: '', variantId: null}};
  }
  const product = await fetchProductFactsByHandle(ctx.env, catalogChannel, handle, {
    clientRequest: ctx.request,
    urlChannel: ctx.channelId,
  });
  if (!product) {
    return {product: null, shownPatch: null, selected: {productId: '', variantId: null}};
  }
  const url = product.url?.trim();
  if (!url) {
    return {product: null, shownPatch: null, selected: {productId: '', variantId: null}};
  }
  const variantIds = product.variants.map((v) => v.variantId).filter(Boolean);
  const shownPatch: GemmaShownRef = {
    ref: ref || 'detail',
    productId: product.productId,
    handle: product.handle,
    variantIds,
    url,
  };
  return {
    product,
    shownPatch,
    selected: {productId: product.productId, variantId: null},
  };
}
