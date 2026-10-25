import type {BuyerDiscoverSlots} from './discover-slots';

export const NEED_PROFILE_MIN = 2;
export const MAX_DISCOVER_TURNS = 2;

export const PROFILE_SLOT_KEYS: (keyof BuyerDiscoverSlots)[] = [
  'recipient',
  'occasion',
  'product_type',
  'budget',
  'metal',
  'stone',
];

export const DISCOVER_QUESTION_ORDER: (keyof BuyerDiscoverSlots)[] = [
  'product_type',
  'recipient',
  'budget',
  'metal',
  'stone',
  'occasion',
];

export const NON_COMMITMENT_RE =
  /\b(nie\s+wiem|no\s+nie\s+wiem|nie\s+mam\s+pojęcia|ciężko\s+powiedzieć|trudno\s+powiedzieć|jakakolwiek|wszystko\s+jedno)\b/iu;

export const OPEN_CATALOG_RE =
  /\b(pokaż\s+cokolwiek|pokaż\s+coś|pokaż\s+dowolne|jakikolwiek\s+model|dowolny\s+model)\b/iu;

export function countProfileSlots(slots: BuyerDiscoverSlots): number {
  let n = 0;
  for (const key of PROFILE_SLOT_KEYS) {
    if (slots[key]?.trim()) n += 1;
  }
  return n;
}

export function profileMeetsSearchMinimum(slots: BuyerDiscoverSlots): boolean {
  return countProfileSlots(slots) >= NEED_PROFILE_MIN;
}

export function hasImmediateCatalogSignal(slots: BuyerDiscoverSlots): boolean {
  const pt = slots.product_type?.trim() ?? '';
  const metal = slots.metal?.trim() ?? '';
  const stone = slots.stone?.trim() ?? '';
  if (pt && (metal || stone)) return true;
  if (metal && stone) return true;
  return false;
}

export function isAmbiguousGiftLikeProfile(slots: BuyerDiscoverSlots): boolean {
  if (profileMeetsSearchMinimum(slots)) return false;
  if (hasImmediateCatalogSignal(slots)) return false;
  const pt = slots.product_type?.trim() ?? '';
  const metal = slots.metal?.trim() ?? '';
  const stone = slots.stone?.trim() ?? '';
  if (pt || metal || stone) return false;
  return Boolean(slots.occasion?.trim() || slots.recipient?.trim());
}

const QUALITATIVE_BUDGET_RE =
  /\b(tanio|taniej|skromnie|niedrogo|budżet|do\s+\d|poniżej|powyżej|\d+\s*zł|\d{3,})\b/iu;

export function hasQualitativeBudgetSignal(
  slots: BuyerDiscoverSlots,
  userText?: string,
): boolean {
  const b = slots.budget?.trim() ?? '';
  if (b && QUALITATIVE_BUDGET_RE.test(b)) return true;
  if (b && /\d/.test(b)) return true;
  const t = userText?.trim() ?? '';
  return t.length > 0 && QUALITATIVE_BUDGET_RE.test(t);
}

export function hasNamedProductType(slots: BuyerDiscoverSlots): boolean {
  const pt = slots.product_type?.trim() ?? '';
  return pt.length > 0 && !/^gift$/i.test(pt);
}

export function isNonCommitmentUserText(userText?: string): boolean {
  const t = userText?.trim() ?? '';
  return t.length > 0 && NON_COMMITMENT_RE.test(t);
}

export function clientRequestsOpenCatalog(userText?: string): boolean {
  const t = userText?.trim() ?? '';
  return OPEN_CATALOG_RE.test(t);
}

export function pickDiscoverMissingSlot(slots: BuyerDiscoverSlots): keyof BuyerDiscoverSlots {
  for (const key of DISCOVER_QUESTION_ORDER) {
    if (!slots[key]?.trim()) return key;
  }
  return 'product_type';
}

const ENGAGEMENT_RE = /\b(zaręczyn|zareczyn|engagement|pierścionek\s+zaręczyn)/iu;

export function isEngagementRingContext(
  slots: BuyerDiscoverSlots,
  corpus: string,
): boolean {
  return ENGAGEMENT_RE.test(corpus) || ENGAGEMENT_RE.test(slots.product_type ?? '');
}

export function shouldDeferPoliciesForEngagementAdvisory(
  slots: BuyerDiscoverSlots,
  userText: string,
): boolean {
  const corpus = userText;
  if (!isEngagementRingContext(slots, corpus)) {
    return false;
  }
  const sizeGap =
    /\b(rozmiar|obwód|numer)\b/iu.test(corpus) &&
    /\b(nie\s+znam|nie\s+wiem|brak)/iu.test(corpus);
  const deadlineGap = /\b(termin|deadline|kiedy\s+potrzeb|data\s+ślub)/iu.test(corpus);
  const buying =
    /\b(pierścionek|zaręczyn|dobór|doradz|pomóż|wybór)/iu.test(corpus) &&
    (sizeGap || deadlineGap);
  return buying || sizeGap;
}

function engagementSizeGapUnresolved(corpus: string): boolean {
  if (!/\b(rozmiar|obwód|numer)\b/iu.test(corpus)) return false;
  if (/\brozmiar\s*[:\-]?\s*\d{1,2}/iu.test(corpus)) return false;
  if (/\bobwód\s*[:\-]?\s*\d{1,2}/iu.test(corpus)) return false;
  return /\b(nie\s+znam|nie\s+wiem|brak)/iu.test(corpus);
}

function engagementDeadlineGapUnresolved(corpus: string): boolean {
  if (!/\b(termin|deadline)\b/iu.test(corpus)) return false;
  if (
    /\b(termin|deadline)\b[^.\n]{0,48}\b(za\s+\d|do\s+\d|miesiąc|tydzień)/iu.test(corpus)
  ) {
    return false;
  }
  return /\b(nie\s+znam|nie\s+wiem|brak)/iu.test(corpus);
}

/** Doradztwo zaręczyny z brakami — katalog dopiero po budżecie + domknięciu luk rozmiar/termin. */
export function engagementAdvisoryRequirementsMet(
  slots: BuyerDiscoverSlots,
  corpus: string,
): boolean {
  if (!slots.budget?.trim()) return false;
  if (engagementSizeGapUnresolved(corpus)) return false;
  if (engagementDeadlineGapUnresolved(corpus)) return false;
  return true;
}

export function engagementAdvisoryBlocksCatalog(
  slots: BuyerDiscoverSlots,
  userText: string,
  allUserTexts: string[],
): boolean {
  const corpus = allUserTexts.join('\n');
  if (!isEngagementRingContext(slots, corpus)) return false;
  if (clientRequestsOpenCatalog(userText)) return false;

  const advisoryActive =
    shouldDeferPoliciesForEngagementAdvisory(slots, userText) ||
    shouldDeferPoliciesForEngagementAdvisory(slots, corpus) ||
    (isEngagementRingContext(slots, corpus) &&
      (engagementSizeGapUnresolved(corpus) || engagementDeadlineGapUnresolved(corpus)));

  if (!advisoryActive) return false;
  return !engagementAdvisoryRequirementsMet(slots, corpus);
}

export function allowSearchCatalogThisTurn(params: {
  slots: BuyerDiscoverSlots;
  userText: string;
  allUserTexts?: string[];
  discoverAssistantTurns: number;
  catalogAlreadyShown: boolean;
}): boolean {
  if (params.catalogAlreadyShown) return true;
  if (clientRequestsOpenCatalog(params.userText)) return true;
  const userLines = params.allUserTexts?.length ? params.allUserTexts : [params.userText];
  if (engagementAdvisoryBlocksCatalog(params.slots, params.userText, userLines)) {
    return false;
  }
  if (hasQualitativeBudgetSignal(params.slots, params.userText)) return true;
  if (hasImmediateCatalogSignal(params.slots)) return true;
  if (hasNamedProductType(params.slots) && !isAmbiguousGiftLikeProfile(params.slots)) {
    return true;
  }
  if (isNonCommitmentUserText(params.userText)) return false;
  if (!profileMeetsSearchMinimum(params.slots)) return false;
  if (isAmbiguousGiftLikeProfile(params.slots)) {
    return params.discoverAssistantTurns >= MAX_DISCOVER_TURNS;
  }
  return true;
}
