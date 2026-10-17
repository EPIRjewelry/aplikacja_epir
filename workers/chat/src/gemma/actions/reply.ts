import {buildGemmaVariantPriceFacts} from '../facts/variant-prices';
import {
  buildEpirDeterministicReply,
  epirCartConsentWithProductLink,
  epirCartErrorReply,
  epirCatalogEmptyReply,
  epirCatalogCardsReply,
  epirDetailsPricesReply,
  epirKbAnswerReply,
  epirKbUnavailableReply,
  epirVariantQuestionReply,
  epirCartShowEmptyReply,
  epirCartShowLinesReply,
} from '../profiles/epir';
import {formatBuyerCatalogLine} from '../formulation/buyer-reply-format';
import {formatCartMutationReply, formatCartShowBodyFromToolContent} from './cart';
import type {GemmaActionOutcome} from './types';
import type {BuyerChannelId} from '../../buyer/channel-switch';
import type {GemmaConversationState} from '../state/types';
import type {GemmaIntent} from '../intent/schema';

export function buildEpirActionReply(params: {
  channelId: BuyerChannelId;
  state: GemmaConversationState;
  missingSlot?: keyof import('../state/types').GemmaSlots;
  cartNeedsConsent?: boolean;
  intent: GemmaIntent;
  outcome: GemmaActionOutcome;
}): string {
  const {channelId, state, outcome, intent} = params;

  if (intent.cart_action === 'show' && outcome.cart) {
    if (outcome.cart.cartFailed) {
      return epirCartErrorReply(channelId, outcome.cart.clientErrors ?? []);
    }
    const summary = outcome.cart.cartShowSummary;
    if (summary) {
      const body = formatCartShowBodyFromToolContent(summary);
      if (body) return epirCartShowLinesReply(body);
      return epirCartShowEmptyReply(channelId);
    }
    return epirCartShowEmptyReply(channelId);
  }

  if (outcome.cart?.continueUrl) {
    const cartText = formatCartMutationReply(outcome.cart);
    if (cartText) return cartText;
  }

  if (outcome.cart?.clientErrors?.length || outcome.cart?.cartFailed) {
    return epirCartErrorReply(channelId, outcome.cart.clientErrors ?? []);
  }

  if (outcome.cart?.variantUnresolved) {
    const url = outcome.cart.productUrl;
    return epirVariantQuestionReply(channelId, url);
  }

  if (outcome.cart?.needsConsent) {
    return epirCartConsentWithProductLink(channelId, outcome.cart.productUrl);
  }

  if (state === 'polityki_kontakt') {
    if (outcome.kbFailed || !outcome.kb) {
      return epirKbUnavailableReply();
    }
    return epirKbAnswerReply(outcome.kb.answer);
  }

  if (state === 'propozycje') {
    if (outcome.catalogFailed) {
      return epirCatalogEmptyReply(channelId);
    }
    if (outcome.catalogCards.length) {
      const lines = outcome.catalogCards.map((c) => {
        const prices = buildGemmaVariantPriceFacts(c.match);
        const priceText = prices.rangeText || prices.lines[0]?.displayPl || '';
        const shown = outcome.shown.find((s) => s.ref === c.ref);
        return formatBuyerCatalogLine({
          title: c.match.product.title,
          url: shown?.url || '',
          priceDisplay: priceText,
        });
      });
      return epirCatalogCardsReply(lines.join('\n'));
    }
    return epirCatalogEmptyReply(channelId);
  }

  if (state === 'szczegoly' && outcome.productDetail) {
    const prices = buildGemmaVariantPriceFacts({
      product: outcome.productDetail,
      matchingVariantIds: outcome.productDetail.variants.map((v) => v.variantId),
      matchingVariants: outcome.productDetail.variants,
      matchingPriceRange: outcome.productDetail.priceRange,
      isFlat: outcome.productDetail.priceRange.isFlat,
    });
    return epirDetailsPricesReply(prices.lines.map((l) => l.displayPl).join(', '));
  }

  return buildEpirDeterministicReply({
    channelId,
    state,
    missingSlot: params.missingSlot,
    cartNeedsConsent: params.cartNeedsConsent,
  });
}
