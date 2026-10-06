/**
 * Pełna ścieżka tekstu do UI (po modelu, przed SSE) — wspólna dla worker i live-eval.
 */

import {stripForeignBrandLinks} from '../brand-reply-host';
import {guardBuyerReply} from '../brand-lock';
import {detectIllegalOrHarmfulRequest, HARD_REFUSAL_REPLY} from '../intent/jailbreak-prefilter';
import {detectPolicyInformationIntent} from '../intent/policy-information';
import {detectSizeTableIntent, guardSizeQuestionReply} from '../intent/size-table';
import {isProjectBChatChannel} from '../operator/operator-channel';
import {guardAssistantPricingAgainstCatalog} from '../pricing-guard';
import {guardLiveCatalogProductLinks} from './live-store-product';
import {
  guardBuyerCatalogReply,
  productsFromCatalogSnapshots,
  type StoneLookup,
} from './buyer-reply-guard';
import {
  guardDiscoveryFromPrice,
  guardForeignCatalogPrices,
  guardPageProductBuyerReply,
} from './page-product-card';
import {guardStoreFacts} from './store-facts';
import {originAskForTurn} from './stone-origin';
import {detectStoneIntent, stoneIntentFromConversation} from './stone-intent';

export type FinalizeBuyerReplyInput = {
  text: string;
  userMessage: string;
  buyerTurns: readonly string[];
  previousAssistant?: string;
  catalogSnapshots: readonly unknown[];
  stoneLookup?: StoneLookup;
  brand?: string;
  storefrontId?: string;
  channel?: string;
  pageCard?: Record<string, unknown> | null;
  aboutPageProduct?: boolean;
  sessionId?: string;
};

export function finalizeBuyerFacingReply(input: FinalizeBuyerReplyInput): string {
  const {
    text,
    userMessage,
    buyerTurns,
    previousAssistant,
    catalogSnapshots,
    stoneLookup,
    brand: replyBrand,
    storefrontId,
    channel,
    pageCard,
    aboutPageProduct,
    sessionId,
  } = input;

  if (isProjectBChatChannel(channel)) return text;
  if (detectIllegalOrHarmfulRequest(userMessage)) return HARD_REFUSAL_REPLY;

  const outcome = guardAssistantPricingAgainstCatalog(text, catalogSnapshots, {sessionId});
  const stoneGuarded = guardBuyerCatalogReply(outcome.text, {
    buyerTurns,
    previousAssistant,
    catalogSnapshots,
    stoneLookup,
    brand: replyBrand,
  });

  const policyTurn = detectPolicyInformationIntent(userMessage).match;
  const sizeTurn = detectSizeTableIntent(userMessage).match;
  let buyerText = stoneGuarded.text;

  if (sizeTurn) {
    const sized = guardSizeQuestionReply(buyerText);
    if (sized.replaced) buyerText = sized.text;
  } else if (!policyTurn && aboutPageProduct && pageCard) {
    const pageGuarded = guardPageProductBuyerReply(buyerText, pageCard, userMessage);
    if (pageGuarded.replaced) buyerText = pageGuarded.text;
  } else if (!policyTurn) {
    const cards = productsFromCatalogSnapshots(catalogSnapshots);
    const varyingDiscovery = cards.some((card) => card.price_is_flat === false);
    const stone = detectStoneIntent(userMessage) ?? stoneIntentFromConversation(buyerTurns);
    const originAsk = originAskForTurn(buyerTurns);
    const skipDiscoveryGuard = Boolean(
      stone && (originAsk || /\bdo\s+\d+\s*zł/i.test(userMessage) || /^Tak,|^Nie,/m.test(buyerText)),
    );
    if (!skipDiscoveryGuard && (cards.length > 1 || varyingDiscovery)) {
      const fromPrice = guardDiscoveryFromPrice(buyerText, cards);
      if (fromPrice.replaced) buyerText = fromPrice.text;
      else {
        const foreign = guardForeignCatalogPrices(buyerText, cards);
        if (foreign.replaced) buyerText = foreign.text;
      }
    }
  }

  const factGuarded = guardStoreFacts(buyerText, replyBrand, {userMessage});
  const locked = stripForeignBrandLinks(factGuarded.text, replyBrand);
  const liveLinked = guardLiveCatalogProductLinks(locked.text, catalogSnapshots);
  const voiced = guardBuyerReply(liveLinked.text, {
    side:
      replyBrand === 'kazka' || storefrontId === 'kazka'
        ? 'kazka'
        : replyBrand === 'zareczyny' || storefrontId === 'zareczyny'
          ? 'zareczyny'
          : 'epir',
  });
  return voiced.text;
}
