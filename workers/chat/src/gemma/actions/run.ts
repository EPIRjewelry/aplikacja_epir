import type {GemmaActionContext, GemmaActionOutcome} from './types';
import {runCatalogAction} from './catalog';
import {runProductDetailAction} from './product-detail';
import {runKbAction} from './kb';
import {runCartAction} from './cart';

export async function runGemmaAllowedActions(ctx: GemmaActionContext): Promise<GemmaActionOutcome> {
  const outcome: GemmaActionOutcome = {
    shown: [...ctx.prev.shown],
    selected: ctx.prev.selected,
    catalogCards: [],
    kb: null,
    cart: null,
    productDetail: null,
    catalogFailed: false,
    kbFailed: false,
    cartFailed: false,
  };

  const actions = ctx.transitioned.allowedActions;

  if (actions.includes('search_catalog')) {
    try {
      const {cards, shown} = await runCatalogAction(ctx);
      outcome.catalogCards = cards;
      outcome.shown = shown;
    } catch (e) {
      console.warn('[gemma.actions] catalog failed', e);
      outcome.catalogFailed = true;
    }
  }

  if (actions.includes('get_product')) {
    try {
      const detail = await runProductDetailAction(ctx);
      if (detail.product) {
        outcome.productDetail = detail.product;
        outcome.selected = detail.selected;
        if (detail.shownPatch) {
          const rest = outcome.shown.filter((s) => s.ref !== detail.shownPatch!.ref);
          outcome.shown = [...rest, detail.shownPatch];
        }
      }
    } catch (e) {
      console.warn('[gemma.actions] product detail failed', e);
      outcome.catalogFailed = true;
    }
  }

  if (actions.includes('kb_policies')) {
    try {
      const kb = await runKbAction(ctx);
      if (kb.ok) {
        outcome.kb = kb.facts;
      } else {
        outcome.kbFailed = true;
        outcome.kbMiss = kb.reason;
      }
    } catch (e) {
      console.warn('[gemma.actions] kb failed', e);
      outcome.kbFailed = true;
      outcome.kbMiss = 'mcp_error';
    }
  }

  if (actions.includes('cart') && ctx.intent.cart_action) {
    try {
      outcome.cart = await runCartAction(ctx);
      if (outcome.cart?.selectedProductId) {
        outcome.selected = {
          productId: outcome.cart.selectedProductId,
          variantId: outcome.cart.selectedVariantId ?? null,
        };
      }
    } catch (e) {
      console.warn('[gemma.actions] cart failed', e);
      outcome.cartFailed = true;
      outcome.cart = {cartFailed: true};
    }
  }

  return outcome;
}
