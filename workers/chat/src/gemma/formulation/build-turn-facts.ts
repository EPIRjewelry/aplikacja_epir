import {buildGemmaVariantPriceFacts} from '../facts/variant-prices';
import type {GemmaActionOutcome} from '../actions/types';
import type {GemmaConversationState, GemmaSlots} from '../state/types';
import type {BuyerChannelId} from '../../buyer/channel-switch';
import {contactPageUrl} from '../profiles/epir';
import type {TurnFacts} from './types';

function numbersFromText(text: string): string[] {
  const joined = text.replace(/(\d)[\s.\-]+(?=\d)/g, '$1');
  const re = /\d+/g;
  const out: string[] = [];
  let m;
  while ((m = re.exec(joined)) !== null) {
    if (m[0]) out.push(m[0]);
  }
  return out;
}

export function shouldInvokeFormulationB(
  state: GemmaConversationState,
  outcome: GemmaActionOutcome,
): boolean {
  if (state === 'propozycje') {
    return !outcome.catalogFailed && outcome.catalogCards.length > 0;
  }
  if (state === 'szczegoly') {
    return outcome.productDetail !== null;
  }
  if (state === 'polityki_kontakt') {
    return !outcome.kbFailed && outcome.kb !== null;
  }
  return false;
}

export function buildTurnFacts(params: {
  channelId: BuyerChannelId;
  state: GemmaConversationState;
  missingSlot?: keyof GemmaSlots;
  userText: string;
  outcome: GemmaActionOutcome;
}): TurnFacts {
  const {channelId, state, outcome, userText} = params;
  const products: TurnFacts['products'] = [];
  const allowedUrls = new Set<string>();
  allowedUrls.add(contactPageUrl(channelId));

  if (state === 'propozycje') {
    for (const card of outcome.catalogCards) {
      const prices = buildGemmaVariantPriceFacts(card.match);
      const priceDisplay = prices.rangeText || prices.lines[0]?.displayPl || '';
      const shown = outcome.shown.find((s) => s.ref === card.ref);
      const url = shown?.url || '';
      if (url) allowedUrls.add(url);
      const variants = card.match.matchingVariants.length
        ? card.match.matchingVariants
        : card.match.product.variants;
      products.push({
        ref: card.ref,
        url,
        priceDisplay,
        title: card.match.product.title,
        available: variants.some((v) => v.available),
      });
    }
  }

  if (state === 'szczegoly' && outcome.productDetail) {
    const prices = buildGemmaVariantPriceFacts({
      product: outcome.productDetail,
      matchingVariantIds: outcome.productDetail.variants.map((v) => v.variantId),
      matchingVariants: outcome.productDetail.variants,
      matchingPriceRange: outcome.productDetail.priceRange,
      isFlat: outcome.productDetail.priceRange.isFlat,
    });
    // Ref i link produktu ze szczegółów (po productId), nie ślepe shown[0].
    const detail = outcome.productDetail;
    const shownDetail = outcome.shown.find((s) => s.productId === detail.productId);
    const ref = shownDetail?.ref || 'g1';
    const url = shownDetail?.url || detail.url || '';
    if (url) allowedUrls.add(url);
    const priceDisplay = prices.lines.map((l) => l.displayPl).join(', ');
    products.push({
      ref,
      url,
      priceDisplay,
      title: detail.title,
      available: detail.variants.some((v) => v.available),
    });
  }

  const allowedNumbers = new Set<string>(numbersFromText(userText));
  for (const p of products) {
    for (const n of numbersFromText(p.priceDisplay)) allowedNumbers.add(n);
    for (const n of numbersFromText(p.title)) allowedNumbers.add(n);
  }

  const kbAnswer = state === 'polityki_kontakt' && outcome.kb ? outcome.kb.answer : null;
  if (kbAnswer) {
    for (const n of numbersFromText(kbAnswer)) allowedNumbers.add(n);
  }

  return {
    channelId,
    state,
    missingSlot: params.missingSlot,
    allowedRefs: products.map((p) => p.ref),
    products,
    kbAnswer,
    allowedUrls: [...allowedUrls],
    allowedNumbers: [...allowedNumbers],
  };
}

export function validationFactsFromTurn(
  turn: TurnFacts,
  userText: string,
): import('../validation/reply-validator').ReplyValidationFacts {
  return {
    allowedRefs: new Set(turn.allowedRefs),
    allowedNumbers: new Set(turn.allowedNumbers),
    kbAnswer: turn.kbAnswer,
    userText,
    channelId: turn.channelId,
    conversationState: turn.state,
  };
}

export function allowedUrlSet(turn: TurnFacts): Set<string> {
  const set = new Set<string>();
  for (const u of turn.allowedUrls) {
    if (u?.trim()) set.add(u.trim().replace(/\/$/, ''));
  }
  return set;
}
