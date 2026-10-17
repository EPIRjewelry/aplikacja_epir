import {moneyFromMinor} from '../../facts/types';
import {catalogTextFromSlots} from '../state/slot-markers';
import type {GemmaSlots} from '../state/types';
import type {GemmaCatalogSearchFilters} from '../facts/types';
import {customerRequestsGiftCard} from '../facts/gift-card-catalog';

/** Cyfry ze slotu budżetu muszą wystąpić w korpusie usera (D1). */
function corpusNumberSet(userCorpus: string): Set<string> {
  const out = new Set<string>();
  for (const m of userCorpus.match(/\d+(?:[,.]\d+)?/g) ?? []) {
    const compact = m.replace(/\s/g, '');
    out.add(compact);
    out.add(compact.replace(',', '.'));
    out.add(compact.replace('.', ','));
  }
  for (const m of userCorpus.match(/\d(?:[\d ]*\d)?/g) ?? []) {
    out.add(m.replace(/\s/g, ''));
  }
  return out;
}

function normalizeBudgetDigits(digits: string): string {
  return digits.replace(/\s/g, '');
}

function plnFromBudgetDigits(digits: string): number | undefined {
  const normalized = normalizeBudgetDigits(digits).replace(',', '.');
  const pln = Number(normalized);
  if (!Number.isFinite(pln) || pln <= 0) return undefined;
  return pln;
}

function normalizeBudgetCorpus(userCorpus: string): string {
  return userCorpus.replace(/,/g, '.');
}

function thousandMultiplierInCorpus(digits: string, userCorpus: string): boolean {
  const pln = plnFromBudgetDigits(digits);
  if (pln === undefined) return false;
  const corpus = normalizeBudgetCorpus(userCorpus);
  const amountLiteral = String(pln).replace('.', '\\.');
  const thousandSuffix = '(?:tys\\.?|tysiąc|tysiące|tysięcy|tyś)';
  const tysRe = new RegExp(`(?<!\\p{L})${amountLiteral}\\s*${thousandSuffix}(?!\\p{L})`, 'iu');
  if (tysRe.test(corpus)) return true;
  const kRe = new RegExp(`(?<!\\p{L})${amountLiteral}\\s*k(?!\\p{L})`, 'iu');
  return kRe.test(corpus);
}

function minorFromBudgetDigits(digits: string, userCorpus: string): number | undefined {
  const pln = plnFromBudgetDigits(digits);
  if (pln === undefined) return undefined;
  if (thousandMultiplierInCorpus(digits, userCorpus)) {
    return pln * 1000 * 100;
  }
  return pln * 100;
}

/** Cyfry ze slotu budżetu muszą wystąpić w korpusie usera (D1). */
export function budgetMinorFromSlots(slots: GemmaSlots, userCorpus: string): number | undefined {
  const raw = slots.budget?.trim();
  if (!raw) return undefined;
  const digitRuns = raw.match(/\d+(?:[,.]\d+)?(?:\s*\d+)*/g) ?? raw.match(/\d[\d\s]*/g);
  if (!digitRuns?.length) return undefined;
  const corpusNumbers = corpusNumberSet(userCorpus);
  for (const run of digitRuns) {
    const digits = normalizeBudgetDigits(run);
    if (!digits) continue;
    const corpusHit =
      corpusNumbers.has(digits) ||
      corpusNumbers.has(digits.replace(',', '.')) ||
      corpusNumbers.has(digits.replace('.', ','));
    if (!corpusHit) continue;
    const minor = minorFromBudgetDigits(digits, userCorpus);
    if (minor !== undefined) return minor;
  }
  return undefined;
}

function slotBudgetDigits(slots: GemmaSlots): Set<string> {
  const raw = slots.budget?.trim() ?? '';
  return new Set((raw.match(/\d[\d\s]*/g) ?? []).map((r) => r.replace(/\s/g, '')).filter(Boolean));
}

function parseRangeBounds(
  userCorpus: string,
  corpusNumbers: Set<string>,
  budgetDigits: Set<string>,
): {minMinor: number; maxMinor: number} | null {
  // Zakres tylko dla liczb budżetu (slot A): „rozmiar 12-14” nie jest ceną.
  if (!budgetDigits.size) return null;
  const patterns = [
    /(?<!\p{L})od\s+(\d[\d\s]*)\s+do\s+(\d[\d\s]*)/giu,
    /(\d[\d\s]*)\s*[–-]\s*(\d[\d\s]*)/gu,
    /(?<!\p{L})między\s+(\d[\d\s]*)\s+a\s+(\d[\d\s]*)/giu,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(userCorpus)) !== null) {
      const a = m[1].replace(/\s/g, '');
      const b = m[2].replace(/\s/g, '');
      if (!corpusNumbers.has(a) || !corpusNumbers.has(b)) continue;
      if (!budgetDigits.has(a) && !budgetDigits.has(b)) continue;
      const plnA = Number(a);
      const plnB = Number(b);
      if (!Number.isFinite(plnA) || !Number.isFinite(plnB) || plnA <= 0 || plnB <= 0) continue;
      const lo = Math.min(plnA, plnB) * 100;
      const hi = Math.max(plnA, plnB) * 100;
      return {minMinor: lo, maxMinor: hi};
    }
  }
  return null;
}

function isMinBudgetMarkerBeforeNumber(userCorpus: string, digits: string): boolean {
  const spaced = digits.split('').join('\\s*');
  const re = new RegExp(
    `(?<!\\p{L})(?:od|powyżej|ponad|minimum|co najmniej|nie mniej niż)\\s+${spaced}(?:\\s*zł)?`,
    'iu',
  );
  return re.test(userCorpus);
}

export function budgetPriceBoundsFromSlots(
  slots: GemmaSlots,
  userCorpus: string,
): {priceMin?: ReturnType<typeof moneyFromMinor>; priceMax?: ReturnType<typeof moneyFromMinor>} {
  const corpusNumbers = corpusNumberSet(userCorpus);
  const range = parseRangeBounds(userCorpus, corpusNumbers, slotBudgetDigits(slots));
  if (range) {
    return {
      priceMin: moneyFromMinor(range.minMinor),
      priceMax: moneyFromMinor(range.maxMinor),
    };
  }

  const minor = budgetMinorFromSlots(slots, userCorpus);
  if (minor === undefined) return {};

  const digits = String(minor / 100);
  if (isMinBudgetMarkerBeforeNumber(userCorpus, digits)) {
    return {priceMin: moneyFromMinor(minor)};
  }
  return {priceMax: moneyFromMinor(minor)};
}

export function slotsToCatalogFilters(
  slots: GemmaSlots,
  userCorpus: string,
): GemmaCatalogSearchFilters {
  const text = catalogTextFromSlots(slots);
  const bounds = budgetPriceBoundsFromSlots(slots, userCorpus);
  const qualitative = isQualitativeBudget(slots, userCorpus);
  const filters: GemmaCatalogSearchFilters = {text: text || undefined};
  if (slots.metal?.trim()) filters.metal = [slots.metal.trim()];
  if (slots.stone?.trim()) filters.stone = [slots.stone.trim()];
  if (bounds.priceMin !== undefined) filters.priceMin = bounds.priceMin;
  if (bounds.priceMax !== undefined) filters.priceMax = bounds.priceMax;
  if (qualitative && !text) {
    filters.ucpBrowseInStockAvailable = true;
    filters.available = true;
  }
  if (!customerRequestsGiftCard(slots, userCorpus)) {
    filters.excludeGiftCards = true;
  }
  return filters;
}

/** Budżet słowny („tanio”) bez kwoty od klienta — wtedy sortujemy po cenie, bez progu (D1). */
export function isQualitativeBudget(slots: GemmaSlots, userCorpus: string): boolean {
  return Boolean(slots.budget?.trim()) && budgetMinorFromSlots(slots, userCorpus) === undefined;
}

/** Budżet słowny „luksus” — sort malejący po cenie (intencja A, slot budget). */
export function isLuxuryQualitativeBudget(slots: GemmaSlots): boolean {
  const b = slots.budget?.trim().toLowerCase() ?? '';
  return b.includes('luksus');
}

/** Budżet słowny „tanio” — sort rosnący po cenie (D-Q2 drobne). */
export function isTanioQualitativeBudget(slots: GemmaSlots): boolean {
  const b = slots.budget?.trim().toLowerCase() ?? '';
  return b.includes('tanio');
}

export function attachMinMinorToMatches(
  matches: import('../../facts/types').ProductMatch[],
): import('../facts/catalog-search').GemmaCatalogPricedMatch[] {
  return matches.map((m) => {
    const variants = m.matchingVariants.length ? m.matchingVariants : m.product.variants;
    const minors = variants.map((v) => v.price.minor ?? v.price.amount_minor ?? 0);
    const minMinor = minors.length ? Math.min(...minors) : 0;
    return {match: m, minMinor};
  });
}

export function sortMatchesByMinVariantPrice(
  matches: import('../../facts/types').ProductMatch[],
  sortAscending = true,
) {
  const priced = attachMinMinorToMatches(matches);
  return sortAscending
    ? priced.sort((a, b) => a.minMinor - b.minMinor)
    : priced.sort((a, b) => b.minMinor - a.minMinor);
}
