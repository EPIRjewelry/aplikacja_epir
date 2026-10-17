import {EPIR_CUSTOM_ORDER_FORM_URL, resolveUrlForChannel} from '../../buyer/channel-origins';
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
    'Jeśli chce Pan lub Pani porozmawiać z pracownią, zapraszam na stronę kontaktu: ' +
    contactPageUrl(channelId) +
    '.'
  );
}

export function epirWelcomeReply(): string {
  return 'Dzień dobry, w czym mogę Panu lub Pani doradzić przy wyborze biżuterii?';
}

function needsQuestionForSlot(slot: keyof GemmaSlots): string {
  switch (slot) {
    case 'product_type':
      return 'Jaki rodzaj biżuterii Pana lub Panią interesuje — pierścionek, kolczyki, naszyjnik, bransoletka?';
    case 'budget':
      return 'Jaki orientacyjny budżet Pana lub Panią interesuje?';
    case 'metal':
      return 'Jaki metal Pana lub Panią interesuje?';
    case 'stone':
      return 'Jaki kamień Pana lub Panią interesuje?';
    case 'occasion':
      return 'Na jaką okazję szuka Pan lub Pani biżuterii?';
    case 'recipient':
      return 'Dla kogo jest prezent?';
    default:
      return 'Czy może Pan lub Pani opisać, czego szuka?';
  }
}

export function epirNeedsReply(missingSlot?: keyof GemmaSlots): string {
  return needsQuestionForSlot(missingSlot ?? 'product_type');
}

export function epirProposalsReply(): string {
  return 'Przygotuję propozycje dopasowane do opisu — proszę o chwilę cierpliwości.';
}

export function epirCartReply(needsConsent: boolean): string {
  if (needsConsent) {
    return 'Czy mogę zaktualizować koszyk zgodnie z prośbą?';
  }
  return 'Zajmę się koszykiem zgodnie z prośbą.';
}

export function epirPolicyReply(): string {
  return 'Sprawdzę informacje o politykach sklepu i wrócę z odpowiedzią.';
}

export function epirDetailsReply(): string {
  return 'Przygotuję szczegóły wskazanego modelu.';
}

export function epirCatalogEmptyReply(channelId: BuyerChannelId): string {
  return (
    'Nie znalazłam propozycji dopasowanych do tego opisu. ' +
    'Czy mogę zapytać, jaki rodzaj biżuterii leży Panu lub Pani na sercu — pierścionek, kolczyki, naszyjnik? ' +
    'Kontakt z pracownią: ' +
    contactPageUrl(channelId) +
    '.'
  );
}

export function epirCatalogTransportReply(channelId: BuyerChannelId): string {
  return (
    'Katalog jest chwilowo niedostępny. Proszę spróbować ponownie za moment lub skontaktować się z pracownią: ' +
    contactPageUrl(channelId) +
    '.'
  );
}

export function epirThanksAckReply(): string {
  return 'Proszę bardzo. Jeśli pojawią się kolejne pytania, jestem do dyspozycji.';
}

export function epirCustomOrderFormReply(): string {
  return (
    'Zamówienia indywidualne i projekty na miarę realizujemy przez formularz: ' +
    EPIR_CUSTOM_ORDER_FORM_URL +
    '.'
  );
}

export function epirCatalogCardsReply(body: string): string {
  return 'Oto propozycje dopasowane do opisu:\n' + body;
}

export function epirKbAnswerReply(answer: string): string {
  return 'Oto informacja ze sklepu:\n' + answer;
}

export function epirKbUnavailableReply(): string {
  return KB_POLICY_UNAVAILABLE_REPLY;
}

/** `messages` z Cart MCP (fakty Shopify) wstawia kod; bez continue_url. */
export function epirCartErrorReply(channelId: BuyerChannelId, shopMessages: string[] = []): string {
  const msgs = shopMessages.map((m) => m.trim()).filter(Boolean);
  return (
    'Nie udało się zaktualizować koszyka. ' +
    (msgs.length ? msgs.join(' ') + ' ' : '') +
    'Kontakt: ' +
    contactPageUrl(channelId) +
    '.'
  );
}

export function epirDetailsPricesReply(variantPriceLine: string): string {
  return 'Szczegóły modelu. Ceny wariantów: ' + variantPriceLine + '.';
}

export function epirCartConsentWithProductLink(channelId: BuyerChannelId, productUrl?: string): string {
  const base = 'Czy mogę zaktualizować koszyk zgodnie z prośbą?';
  if (productUrl?.trim()) {
    return base + ' Można też dodać samodzielnie: ' + productUrl.trim() + '.';
  }
  return base;
}

export function epirVariantQuestionReply(channelId: BuyerChannelId, productUrl?: string): string {
  const link = productUrl?.trim() || contactPageUrl(channelId);
  return 'Który wariant Pana lub Panią interesuje? Szczegóły i dodanie samodzielne: ' + link + '.';
}

export function epirCartShowEmptyReply(channelId: BuyerChannelId): string {
  return 'Koszyk jest pusty. Kontakt: ' + contactPageUrl(channelId) + '.';
}

export function epirCartShowLinesReply(body: string): string {
  return 'Zawartość koszyka:\n' + body;
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

/** Szablon nie może zaczynać się od sztucznego „Proszę Pana” (Cień D5). */
export function templateStartsWithProszePana(text: string): boolean {
  return /^Proszę Pana/i.test(text.trim());
}

export function detectFormOfAddressFromText(userText: string): FormOfAddress {
  const t = userText.toLowerCase();
  if (/\bpani\b/.test(t)) return 'pani';
  if (/\bpan\b/.test(t)) return 'pan';
  return 'unknown';
}
