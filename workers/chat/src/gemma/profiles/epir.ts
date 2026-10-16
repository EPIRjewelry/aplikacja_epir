import {resolveUrlForChannel} from '../../buyer/channel-origins';
import type {BuyerChannelId} from '../../buyer/channel-switch';
import {KB_POLICY_UNAVAILABLE_REPLY} from '../../buyer/kb-policies';
import type {GemmaConversationState, GemmaSlots, FormOfAddress} from '../state/types';

const CONTACT_PAGE_PATH = '/pages/kontakt';

const TY_GRID =
  /(?<!\p{L})(ty|tobie|twój|twoja|twoje|cię|ciebie|napisz|szukasz|chcesz|możesz|wolisz)(?!\p{L})/iu;

export function contactPageUrl(channelId: BuyerChannelId): string {
  return (
    resolveUrlForChannel(CONTACT_PAGE_PATH, channelId) ??
    resolveUrlForChannel(CONTACT_PAGE_PATH, 'epir-online-store') ??
    CONTACT_PAGE_PATH
  );
}

export function epirRefusalReply(channelId: BuyerChannelId): string {
  return (
    'Nie mogę pomóc w tej prośbie. ' +
    'Proszę Pana/Panią o kontakt przez stronę kontaktu: ' +
    contactPageUrl(channelId) +
    '.'
  );
}

export function epirWelcomeReply(): string {
  return 'Dzień dobry. Proszę Pana/Panią — w czym mogę doradzić przy wyborze biżuterii?';
}

function needsQuestionForSlot(slot: keyof GemmaSlots): string {
  switch (slot) {
    case 'product_type':
      return 'Proszę Pana/Panią — jaki rodzaj biżuterii Pana/Panią interesuje?';
    case 'budget':
      return 'Proszę Pana/Panią — jaki orientacyjny budżet Pana/Panią interesuje?';
    case 'metal':
      return 'Proszę Pana/Panią — jaki metal Pana/Panią interesuje?';
    case 'stone':
      return 'Proszę Pana/Panią — jaki kamień Pana/Panią interesuje?';
    case 'occasion':
      return 'Proszę Pana/Panią — na jaką okazję szuka Pan/Pani biżuterii?';
    case 'recipient':
      return 'Proszę Pana/Panią — dla kogo jest prezent?';
    default:
      return 'Proszę Pana/Panią — opisać, czego Pan/Pani szuka?';
  }
}

export function epirNeedsReply(missingSlot?: keyof GemmaSlots): string {
  return needsQuestionForSlot(missingSlot ?? 'product_type');
}

export function epirProposalsReply(): string {
  return 'Proszę Pana/Panią — przygotuję propozycje dopasowane do opisu. Proszę o chwilę cierpliwości.';
}

export function epirCartReply(needsConsent: boolean): string {
  if (needsConsent) {
    return 'Proszę Pana/Panią o potwierdzenie, czy mogę zaktualizować koszyk.';
  }
  return 'Proszę Pana/Panią — zajmę się koszykiem zgodnie z prośbą.';
}

export function epirPolicyReply(): string {
  return 'Proszę Pana/Panią — sprawdzę informacje o politykach sklepu i wrócę z odpowiedzią.';
}

export function epirDetailsReply(): string {
  return 'Proszę Pana/Panią — przygotuję szczegóły wskazanego modelu.';
}

export function epirCatalogEmptyReply(channelId: BuyerChannelId): string {
  return (
    'Proszę Pana/Panią — nie znalazłam propozycji w tym opisie. ' +
    'Kontakt: ' +
    contactPageUrl(channelId) +
    '.'
  );
}

export function epirCatalogCardsReply(body: string): string {
  return 'Proszę Pana/Panią — propozycje dopasowane do opisu:\n' + body;
}

export function epirKbAnswerReply(answer: string): string {
  return 'Proszę Pana/Panią — oto informacja ze sklepu:\n' + answer;
}

export function epirKbUnavailableReply(): string {
  return KB_POLICY_UNAVAILABLE_REPLY;
}

/** `messages` z Cart MCP (fakty Shopify) wstawia kod; bez continue_url. */
export function epirCartErrorReply(channelId: BuyerChannelId, shopMessages: string[] = []): string {
  const msgs = shopMessages.map((m) => m.trim()).filter(Boolean);
  return (
    'Proszę Pana/Panią — nie udało się zaktualizować koszyka. ' +
    (msgs.length ? msgs.join(' ') + ' ' : '') +
    'Kontakt: ' +
    contactPageUrl(channelId) +
    '.'
  );
}

export function epirDetailsPricesReply(variantPriceLine: string): string {
  return 'Proszę Pana/Panią — szczegóły modelu. Ceny wariantów: ' + variantPriceLine + '.';
}

export function epirCartConsentWithProductLink(channelId: BuyerChannelId, productUrl?: string): string {
  const base = 'Proszę Pana/Panią o potwierdzenie, czy mogę zaktualizować koszyk.';
  if (productUrl?.trim()) {
    return base + ' Można też dodać samodzielnie: ' + productUrl.trim() + '.';
  }
  return base;
}

export function epirVariantQuestionReply(channelId: BuyerChannelId, productUrl?: string): string {
  const link = productUrl?.trim() || contactPageUrl(channelId);
  return (
    'Proszę Pana/Panią — który wariant Pana/Panią interesuje? ' +
    'Szczegóły i dodanie samodzielne: ' +
    link +
    '.'
  );
}

export function epirCartShowEmptyReply(channelId: BuyerChannelId): string {
  return (
    'Proszę Pana/Panią — koszyk jest pusty. ' +
    'Kontakt: ' +
    contactPageUrl(channelId) +
    '.'
  );
}

export function epirCartShowLinesReply(body: string): string {
  return 'Proszę Pana/Panią — zawartość koszyka:\n' + body;
}

export function buildEpirDeterministicReply(params: {
  channelId: BuyerChannelId;
  state: GemmaConversationState;
  missingSlot?: keyof GemmaSlots;
  cartNeedsConsent?: boolean;
}): string {
  switch (params.state) {
    case 'odmowa':
      return epirRefusalReply(params.channelId);
    case 'powitanie':
      return epirWelcomeReply();
    case 'potrzeby':
      return epirNeedsReply(params.missingSlot);
    case 'propozycje':
      return epirProposalsReply();
    case 'koszyk':
      return epirCartReply(params.cartNeedsConsent === true);
    case 'polityki_kontakt':
      return epirPolicyReply();
    case 'szczegoly':
      return epirDetailsReply();
    default:
      return epirWelcomeReply();
  }
}

/** Skan szablonów v2 pod kątem form na „ty” (T-E3-FORM-1). */
export function listEpirTemplateStrings(channelId: BuyerChannelId): string[] {
  return [
    epirRefusalReply(channelId),
    epirWelcomeReply(),
    epirNeedsReply('product_type'),
    epirNeedsReply('budget'),
    epirProposalsReply(),
    epirCartReply(true),
    epirCartReply(false),
    epirPolicyReply(),
    epirDetailsReply(),
    epirCatalogEmptyReply(channelId),
    epirCatalogCardsReply('g1: /products/fikcyjny-parity'),
    epirKbAnswerReply('Fikcyjna odpowiedź polityki.'),
    epirKbUnavailableReply(),
    epirCartErrorReply(channelId),
    epirCartConsentWithProductLink(channelId, '/products/fikcyjny-parity'),
    epirVariantQuestionReply(channelId, '/products/fikcyjny-parity'),
    epirDetailsPricesReply('fikcyjna lista wariantów'),
    epirCartShowEmptyReply(channelId),
    epirCartShowLinesReply('fikcyjna linia koszyka'),
  ];
}

export function templateUsesInformalTy(text: string): boolean {
  return TY_GRID.test(text);
}

export function detectFormOfAddressFromText(userText: string): FormOfAddress {
  const t = userText.toLowerCase();
  if (/\bpani\b/.test(t)) return 'pani';
  if (/\bpan\b/.test(t)) return 'pan';
  return 'unknown';
}
