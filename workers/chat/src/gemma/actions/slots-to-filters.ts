import {moneyFromMinor} from '../../facts/types';
import {catalogTextFromSlots, isCustomOrderProductType} from '../state/machine';
import type {GemmaSlots} from '../state/types';
import type {GemmaCatalogSearchFilters} from '../facts/types';
import {customerRequestsGiftCard} from '../facts/gift-card-catalog';

function normalizeBudgetCorpus(userCorpus: string): string {
  return userCorpus.replace(/,/g, '.');
}

function plnFromBudgetNumber(pln: number): number | undefined {
  if (!Number.isFinite(pln) || pln <= 0) return undefined;
  return pln;
}

function parseLeadingAmountBeforeThousand(corpus: string): number | undefined {
  const thousandSuffix = '(?:tys\\.?|tysiąc|tysiące|tysięcy|tyś)';
  const re = new RegExp(`(?<!\\p{L})(\\d+(?:[.,]\\d+)?)\\s*${thousandSuffix}(?!\\p{L})`, 'iu');
  const m = re.exec(corpus);
  if (!m?.[1]) return undefined;
  const normalized = m[1].replace(',', '.');
  const pln = Number(normalized);
  return Number.isFinite(pln) && pln > 0 ? pln : undefined;
}

/** ×1000 tylko gdy slot to liczba przed „tys” (np. 5 + „5 tysięcy”), nie pełne PLN (5000). */
function shouldApplyThousandMultiplier(pln: number, userCorpus: string): boolean {
  const corpus = normalizeBudgetCorpus(userCorpus).toLowerCase();
  const corpusAmount = parseLeadingAmountBeforeThousand(corpus);
  if (corpusAmount !== undefined) {
    if (Math.abs(corpusAmount * 1000 - pln) < 0.01) return false;
    if (Math.abs(corpusAmount - pln) < 0.001) return true;
  }
  const amountLiteral = String(pln).replace('.', '\\.');
  const thousandSuffix = '(?:tys\\.?|tysiąc|tysiące|tysięcy|tyś)';
  const tysRe = new RegExp(`(?<!\\p{L})${amountLiteral}\\s*${thousandSuffix}(?!\\p{L})`, 'iu');
  if (tysRe.test(corpus)) return true;
  const kRe = new RegExp(`(?<!\\p{L})${amountLiteral}\\s*k(?!\\p{L})`, 'iu');
  return kRe.test(corpus);
}

function minorFromBudgetPln(pln: number, userCorpus: string): number {
  if (shouldApplyThousandMultiplier(pln, userCorpus)) {
    return Math.round(pln * 1000 * 100);
  }
  return Math.round(pln * 100);
}

/** Structured budget from intent A (`slots.budget` PLN number|null) — not regex-primary. */
export function budgetMinorFromSlots(slots: GemmaSlots, userCorpus: string): number | undefined {
  const pln = slots.budget;
  if (typeof pln !== 'number') return undefined;
  const valid = plnFromBudgetNumber(pln);
  if (valid === undefined) return undefined;
  return minorFromBudgetPln(valid, userCorpus);
}

function slotBudgetDigits(slots: GemmaSlots): Set<string> {
  if (typeof slots.budget === 'number' && Number.isFinite(slots.budget)) {
    return new Set([String(slots.budget)]);
  }
  return new Set();
}

function corpusNumberSet(userCorpus: string): Set<string> {
  const out = new Set<string>();
  for (const m of userCorpus.match(/\d+(?:[,.]\d+)?/g) ?? []) {
    const compact = m.replace(/\s/g, '');
    out.add(compact);
    out.add(compact.replace(',', '.'));
    out.add(compact.replace('.', ','));
  }
  return out;
}

function parseRangeBounds(
  userCorpus: string,
  corpusNumbers: Set<string>,
  budgetDigits: Set<string>,
): {minMinor: number; maxMinor: number} | null {
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

const MIN_BUDGET_MARKERS = [
  'od',
  'powyżej',
  'ponad',
  'minimum',
  'co najmniej',
  'nie mniej niż',
];

function escapeRegExpLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Kwota PLN jako literał regex (kropka dziesiętna nie jest `.` wildcard). */
function budgetAmountRegexAlternatives(pln: number): string[] {
  const raw = String(pln);
  const patterns = new Set<string>();
  patterns.add(escapeRegExpLiteral(raw));
  if (raw.includes('.')) {
    patterns.add(escapeRegExpLiteral(raw.replace('.', ',')));
    const [intPart, frac = ''] = raw.split('.');
    patterns.add(`${escapeRegExpLiteral(intPart)}[.,]${escapeRegExpLiteral(frac)}`);
  }
  return [...patterns];
}

function corpusHasMinBudgetMarker(userCorpus: string, pln: number): boolean {
  const corpus = normalizeBudgetCorpus(userCorpus).toLowerCase();
  for (const marker of MIN_BUDGET_MARKERS) {
    for (const amount of budgetAmountRegexAlternatives(pln)) {
      const re = new RegExp(`(?<!\\p{L})${marker}\\s+${amount}(?!\\p{L})`, 'iu');
      if (re.test(corpus)) return true;
    }
  }
  const corpusThousand = parseLeadingAmountBeforeThousand(corpus);
  if (corpusThousand !== undefined) {
    const impliedPln = corpusThousand * 1000;
    if (Math.abs(corpusThousand - pln) < 0.001 || Math.abs(impliedPln - pln) < 0.01) {
      for (const marker of MIN_BUDGET_MARKERS) {
        for (const amount of budgetAmountRegexAlternatives(corpusThousand)) {
          const re = new RegExp(`(?<!\\p{L})${marker}\\s+${amount}(?!\\p{L})`, 'iu');
          if (re.test(corpus)) return true;
        }
      }
    }
  }
  return false;
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

  const pln = slots.budget;
  if (typeof pln === 'number' && corpusHasMinBudgetMarker(userCorpus, pln)) {
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
  const qualitative = isQualitativeBudget(slots);
  const filters: GemmaCatalogSearchFilters = {text: text || undefined};
  if (slots.metal?.trim()) filters.metal = [slots.metal.trim()];
  if (slots.stone?.trim()) filters.stone = [slots.stone.trim()];
  if (slots.product_type?.trim() && !isCustomOrderProductType(slots.product_type)) {
    filters.productType = [slots.product_type.trim()];
  }
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

/** Budżet słowny (`budget_qualitative`) — sort po cenie, bez progu liczbowego (D1). */
export function isQualitativeBudget(slots: GemmaSlots): boolean {
  return Boolean(slots.budget_qualitative?.trim()) && slots.budget == null;
}

/** Budżet słowny „luksus” — sort malejący po cenie (intencja A). */
export function isLuxuryQualitativeBudget(slots: GemmaSlots): boolean {
  const b = slots.budget_qualitative?.trim().toLowerCase() ?? '';
  return b.includes('luksus');
}

/** Budżet słowny „tanio” — sort rosnący po cenie (D-Q2 drobne). */
export function isTanioQualitativeBudget(slots: GemmaSlots): boolean {
  const b = slots.budget_qualitative?.trim().toLowerCase() ?? '';
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
