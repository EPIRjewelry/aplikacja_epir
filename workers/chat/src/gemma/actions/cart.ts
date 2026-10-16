import {catalogSnapshotChannel} from '../../buyer/channel-switch';
import {filterToolsForSession} from '../../buyer/compose-buyer-turn';
import {
  buildCartContinueReply,
  formatCartLineSummaries,
  formatCartTotalsNote,
} from '../../buyer/cart-continue-reply';
import {normalizeCartPayloadForParsing} from '../../buyer/cart-payload-normalize';
import {extractCartObject} from '../../cart/ucp-cart';
import {executeBuyerTool} from '../../buyer/execute-buyer-tool';
import {fetchProductFactsByHandle} from '../../facts';
import {readSessionCartId} from '../../buyer/session-cart';
import {listAvailableBuyerTools} from '../../buyer/tool-readiness';
import {
  createVariantOptionIndex,
  findVariantIdBySelectedOptions,
  mergeProductFactsIntoIndex,
  type SelectedOption,
} from '../../buyer/variant-option-gate';
import type {ProductFacts} from '../../facts/types';
import type {GemmaActionContext, GemmaCartFacts} from './types';
import type {GemmaIntent} from '../intent/schema';

function parseSelectedOptions(variantChoice: string | null): SelectedOption[] | null {
  if (!variantChoice?.trim()) return null;
  const t = variantChoice.trim();
  try {
    const parsed = JSON.parse(t) as unknown;
    if (Array.isArray(parsed)) {
      const out: SelectedOption[] = [];
      for (const row of parsed) {
        if (row && typeof row === 'object' && 'name' in row && 'value' in row) {
          out.push({name: String((row as {name: unknown}).name), value: String((row as {value: unknown}).value)});
        }
      }
      if (out.length) return out;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

/** Kolejność: jawny product_ref tej tury → produkt ze strony (PDP) → selected z sesji. */
function resolveCartHandle(ctx: GemmaActionContext): string | null {
  const ref = ctx.intent.product_ref?.trim();
  if (ref) {
    const shown = ctx.prev.shown.find((s) => s.ref === ref || s.handle === ref);
    return shown?.handle || null;
  }
  const pageHandle = ctx.productHandle?.trim();
  if (pageHandle) return pageHandle;
  const selectedId = ctx.prev.selected?.productId;
  if (selectedId) {
    return ctx.prev.shown.find((s) => s.productId === selectedId)?.handle || null;
  }
  return null;
}

async function resolveProductForCart(ctx: GemmaActionContext): Promise<ProductFacts | null> {
  const handle = resolveCartHandle(ctx);
  if (!handle) return null;
  return fetchProductFactsByHandle(ctx.env, catalogSnapshotChannel(ctx.channelId), handle, {
    clientRequest: ctx.request,
    urlChannel: ctx.channelId,
  });
}

function resolveVariantId(
  product: ProductFacts,
  index: ReturnType<typeof createVariantOptionIndex>,
  intent: GemmaIntent,
): string | null {
  const variants = product.variants.filter((v) => v.available !== false);
  // Tylko produkt jednowariantowy; jedyny dostępny z wielu (np. rozmiar) nie jest wyborem klienta.
  if (product.variants.length === 1 && variants.length === 1) {
    return variants[0].variantId;
  }
  const choice = intent.variant_choice?.trim();
  if (choice?.startsWith('gid://')) {
    if (variants.some((v) => v.variantId === choice)) return choice;
  }
  const options = parseSelectedOptions(intent.variant_choice);
  if (options?.length) {
    return findVariantIdBySelectedOptions(index, product.productId, options);
  }
  return null;
}

function productUrlFromCtx(ctx: GemmaActionContext, product: ProductFacts | null): string | undefined {
  if (!product) {
    const ref = ctx.intent.product_ref?.trim();
    const selectedId = ctx.prev.selected?.productId;
    const shown = ref
      ? ctx.prev.shown.find((s) => s.ref === ref || s.handle === ref)
      : selectedId
        ? ctx.prev.shown.find((s) => s.productId === selectedId)
        : undefined;
    return shown?.url;
  }
  const shown = ctx.prev.shown.find((s) => s.productId === product.productId);
  return shown?.url || product.url;
}

export async function runCartAction(ctx: GemmaActionContext): Promise<GemmaCartFacts> {
  const intent = ctx.intent;
  const productUrl = productUrlFromCtx(ctx, null);

  if (!intent.cart_action) {
    return {productUrl};
  }

  if (intent.cart_action === 'remove') {
    return {productUrl};
  }

  if (intent.cart_action === 'show') {
    const readyAll = await listAvailableBuyerTools(ctx.env, ctx.channelId);
    const readyTools = filterToolsForSession(readyAll, ctx.sessionId);
    const sessionCartId = ctx.sessionId ? await readSessionCartId(ctx.env, ctx.sessionId) : null;
    if (!sessionCartId || !readyTools.includes('ucp_cart')) {
      return {productUrl};
    }
    try {
      const executed = await executeBuyerTool({
        env: ctx.env,
        channelId: ctx.channelId,
        readyTools,
        name: 'get_cart',
        argsJson: '{}',
        sessionId: ctx.sessionId,
        sessionCartId,
        allowedVariantIds: new Set(),
        request: ctx.request,
      });
      return {productUrl, cartShowSummary: executed.content};
    } catch {
      return {productUrl, cartFailed: true};
    }
  }

  if (intent.cart_action === 'add' || intent.cart_action === 'change') {
    if (intent.cart_consent !== true) {
      return {needsConsent: true, productUrl};
    }

    const product = await resolveProductForCart(ctx);
    if (!product) {
      return {variantUnresolved: true, productUrl};
    }

    const index = createVariantOptionIndex();
    mergeProductFactsIntoIndex(index, product);
    const variantId = resolveVariantId(product, index, intent);
    if (!variantId) {
      return {variantUnresolved: true, productUrl: productUrlFromCtx(ctx, product)};
    }

    const allowedVariantIds = new Set(
      product.variants.map((v) => v.variantId).filter(Boolean),
    );
    const readyAll = await listAvailableBuyerTools(ctx.env, ctx.channelId);
    const readyTools = filterToolsForSession(readyAll, ctx.sessionId);
    const sessionCartId = ctx.sessionId ? await readSessionCartId(ctx.env, ctx.sessionId) : null;
    const toolName = sessionCartId ? 'update_cart' : 'create_cart';
    const args =
      toolName === 'create_cart'
        ? {line_items: [{quantity: 1, item: {id: variantId}}]}
        : {add_items: [{quantity: 1, item: {id: variantId}}]};

    try {
      const executed = await executeBuyerTool({
        env: ctx.env,
        channelId: ctx.channelId,
        readyTools,
        name: toolName,
        argsJson: JSON.stringify(args),
        sessionId: ctx.sessionId,
        sessionCartId,
        allowedVariantIds,
        variantOptionIndex: index,
        request: ctx.request,
      });

      if (executed.cartClientErrors?.length) {
        return {
          productUrl: productUrlFromCtx(ctx, product),
          clientErrors: executed.cartClientErrors,
        };
      }

      if (executed.cartMutationSucceeded && executed.continueUrl) {
        return {
          productUrl: productUrlFromCtx(ctx, product),
          selectedProductId: product.productId,
          selectedVariantId: variantId,
          continueUrl: executed.continueUrl,
          notices: executed.cartNotices,
          totalsNote: executed.cartTotalsNote ?? null,
        };
      }

      return {productUrl: productUrlFromCtx(ctx, product)};
    } catch {
      return {productUrl: productUrlFromCtx(ctx, product), cartFailed: true};
    }
  }

  return {productUrl};
}

export function formatCartMutationReply(facts: GemmaCartFacts): string | null {
  if (!facts.continueUrl?.trim()) return null;
  return buildCartContinueReply({
    continueUrl: facts.continueUrl.trim(),
    notices: facts.notices ?? [],
    totalsNote: facts.totalsNote,
    cartPayload: undefined,
    catalogIndex: undefined,
  });
}

/** Treść klienta dla cart_action=show (E5-D5) — bez cartSummaryBlock / GID. */
export function formatCartShowBodyFromToolContent(content: string): string | null {
  let payload: unknown;
  try {
    payload = JSON.parse(content);
  } catch {
    return null;
  }
  const normalized = normalizeCartPayloadForParsing(payload);
  const lines = formatCartLineSummaries(normalized);
  if (!lines.length) return null;
  const cart = extractCartObject(normalized);
  const currency =
    cart && typeof cart === 'object' && !Array.isArray(cart)
      ? (cart as {currency?: string}).currency
      : undefined;
  const totals =
    cart && typeof cart === 'object' && !Array.isArray(cart)
      ? (cart as {totals?: unknown}).totals
      : undefined;
  const totalsNote = formatCartTotalsNote(totals, currency ?? null);
  const body = totalsNote ? [...lines, totalsNote].join('\n') : lines.join('\n');
  return body.trim() || null;
}
