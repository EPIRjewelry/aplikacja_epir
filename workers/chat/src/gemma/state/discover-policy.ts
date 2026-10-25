import type {GemmaIntent} from '../intent/schema';
import type {GemmaSlots} from './types';

/** Minimalna liczba wypełnionych slotów profilu przed search_catalog przy niejednoznacznym zapytaniu. */
export const NEED_PROFILE_MIN = 2;

/** Maks. tury stanu potrzeby (pytania discover) przed katalogiem przy profilu niepełnym. */
export const MAX_DISCOVER_TURNS = 2;

export const PROFILE_SLOT_KEYS: (keyof GemmaSlots)[] = [
  'recipient',
  'occasion',
  'product_type',
  'budget',
  'metal',
  'stone',
];

/** Kolejność pytań discover (SSOT). */
export const DISCOVER_QUESTION_ORDER: (keyof GemmaSlots)[] = [
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

export function countProfileSlots(slots: GemmaSlots): number {
  let n = 0;
  for (const key of PROFILE_SLOT_KEYS) {
    const v = slots[key];
    if (v !== null && v !== undefined && String(v).trim()) n += 1;
  }
  return n;
}

export function profileMeetsSearchMinimum(slots: GemmaSlots): boolean {
  return countProfileSlots(slots) >= NEED_PROFILE_MIN;
}

/** Konkretny filtr katalogowy — od razu propozycje (regresja S-B). */
export function hasImmediateCatalogSignal(slots: GemmaSlots): boolean {
  const pt = slots.product_type?.trim() ?? '';
  const metal = slots.metal?.trim() ?? '';
  const stone = slots.stone?.trim() ?? '';
  if (pt && (metal || stone)) return true;
  if (metal && stone) return true;
  return false;
}

/** Tylko okazja / odbiorca bez typu lub metalu — wymaga discover. */
export function isAmbiguousGiftLikeProfile(slots: GemmaSlots): boolean {
  if (profileMeetsSearchMinimum(slots)) return false;
  if (hasImmediateCatalogSignal(slots)) return false;
  const pt = slots.product_type?.trim() ?? '';
  const metal = slots.metal?.trim() ?? '';
  const stone = slots.stone?.trim() ?? '';
  if (pt || metal || stone) return false;
  const occ = slots.occasion?.trim() ?? '';
  const rec = slots.recipient?.trim() ?? '';
  return Boolean(occ || rec);
}

const QUALITATIVE_BUDGET_RE =
  /\b(tanio|taniej|skromnie|niedrogo|budżet|do\s+\d|poniżej|powyżej|\d+\s*zł)\b/iu;

/** Budżet słowny / widełki — wystarczy do search_catalog (regresja R03/R04). */
export function hasQualitativeBudgetSignal(slots: GemmaSlots, userText?: string): boolean {
  const b = slots.budget?.trim() ?? '';
  if (b && QUALITATIVE_BUDGET_RE.test(b)) return true;
  const t = userText?.trim() ?? '';
  return t.length > 0 && QUALITATIVE_BUDGET_RE.test(t);
}

export function clientRequestsOpenCatalog(intent: GemmaIntent, userText?: string): boolean {
  const corpus = [userText?.trim() ?? '', intent.policy_query?.trim() ?? ''].join(' ');
  return OPEN_CATALOG_RE.test(corpus);
}

export function isNonCommitmentUserText(userText?: string): boolean {
  const t = userText?.trim() ?? '';
  if (!t) return false;
  return NON_COMMITMENT_RE.test(t);
}

export function pickDiscoverMissingSlot(slots: GemmaSlots): keyof GemmaSlots {
  for (const key of DISCOVER_QUESTION_ORDER) {
    const v = slots[key];
    if (v === null || v === undefined || !String(v).trim()) return key;
  }
  return 'product_type';
}

const ENGAGEMENT_RE = /\b(zaręczyn|zareczyn|engagement|pierścionek\s+zaręczyn)/iu;

export function isEngagementProductContext(slots: GemmaSlots, intent: GemmaIntent): boolean {
  const pt = slots.product_type?.trim() ?? '';
  const pq = intent.policy_query?.trim() ?? '';
  return ENGAGEMENT_RE.test(pt) || ENGAGEMENT_RE.test(pq);
}

/** Zaręczyny z brakami rozmiaru/terminu — discover, nie sam KB dump. */
export function shouldRouteEngagementToDiscover(
  slots: GemmaSlots,
  intent: GemmaIntent,
  userText?: string,
): boolean {
  if (!intent.policy_query?.trim()) return false;
  if (!isEngagementProductContext(slots, intent)) return false;
  const corpus = [intent.policy_query ?? '', userText ?? '', slots.budget ?? ''].join(' ');
  const sizeGap = /\b(rozmiar|obwód|numer)\b/iu.test(corpus) &&
    /\b(nie\s+znam|nie\s+wiem|brak|nie\s+wiem)/iu.test(corpus);
  const deadlineGap = /\b(termin|deadline|kiedy\s+potrzeb|data\s+ślub)/iu.test(corpus);
  const buyingAdvisory =
    /\b(pierścionek|zaręczyn|dobór|doradz|pomóż|wybór)/iu.test(corpus) && (sizeGap || deadlineGap);
  return buyingAdvisory || sizeGap;
}

export function pickEngagementAdvisorySlot(
  slots: GemmaSlots,
  intent: GemmaIntent,
  userText?: string,
): keyof GemmaSlots {
  const corpus = [intent.policy_query ?? '', userText ?? ''].join(' ');
  if (/\b(rozmiar|obwód)\b/iu.test(corpus) && !slots.budget?.trim()) return 'budget';
  if (/\b(termin|deadline|kiedy)\b/iu.test(corpus) && !slots.metal?.trim()) return 'metal';
  return pickDiscoverMissingSlot(slots);
}
