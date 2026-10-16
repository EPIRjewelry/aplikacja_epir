import {buildGemmaVariantPriceFacts} from '../facts/variant-prices';
import {
  buildEpirDeterministicReply,
  epirCartConsentWithProductLink,
  epirCartErrorReply,
  epirCatalogEmptyReply,
  epirCatalogCardsReply,
  epirKbAnswerReply,
  epirKbUnavailableReply,
  epirVariantQuestionReply,
} from '../profiles/epir';
import {formatCartMutationReply} from './cart';
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

  if (outcome.cart?.continueUrl) {
    const cartText = formatCartMutationReply(outcome.cart);
    if (cartText) return cartText;
  }

  if (outcome.cart?.clientErrors?.length) {
    return epirCartErrorReply(channelId);
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
        return `${c.ref}: ${shown?.url || ''} ${priceText}`.trim();
      });
      return epirCatalogCardsReply(lines.join('\n'));
    }
    return epirCatalogEmptyReply(channelId);
  }

  if (state === 'szczegoly' && outcome.productDetail) {
    const prices = buildGemmaVariantPriceFacts({
      product: outcome.productDetail,
      matchingVariants: outcome.productDetail.variants,
      matchingPriceRange: outcome.productDetail.priceRange,
    });
    const line = prices.lines.map((l) => l.displayPl).join(', ');
    return `Proszę Pana/Panią — szczegóły modelu. Ceny wariantów: ${line}.`;
  }

  return buildEpirDeterministicReply({
    channelId,
    state,
    missingSlot: params.missingSlot,
    cartNeedsConsent: params.cartNeedsConsent,
  });
}
