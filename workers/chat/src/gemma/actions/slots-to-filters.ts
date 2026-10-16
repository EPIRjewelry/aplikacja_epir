import {moneyFromMinor} from '../../facts/types';
import type {GemmaSlots} from '../state/types';
import type {GemmaCatalogSearchFilters} from '../facts/types';

/** Cyfry ze slotu budżetu muszą wystąpić w korpusie usera (D1). */
export function budgetMinorFromSlots(slots: GemmaSlots, userCorpus: string): number | undefined {
  const raw = slots.budget?.trim();
  if (!raw) return undefined;
  const corpus = userCorpus.replace(/\s+/g, ' ');
  const digitRuns = raw.match(/\d[\d\s]*/g);
  if (!digitRuns?.length) return undefined;
  for (const run of digitRuns) {
    const digits = run.replace(/\s/g, '');
    if (!digits) continue;
    if (!corpus.replace(/\s/g, '').includes(digits)) continue;
    const pln = Number(digits);
    if (!Number.isFinite(pln) || pln <= 0) continue;
    return pln * 100;
  }
  return undefined;
}

export function slotsToCatalogFilters(
  slots: GemmaSlots,
  userCorpus: string,
): GemmaCatalogSearchFilters {
  const parts = [slots.product_type, slots.occasion, slots.recipient, slots.metal, slots.stone]
    .map((s) => s?.trim())
    .filter(Boolean);
  const text = parts.join(' ').trim();
  const priceMaxMinor = budgetMinorFromSlots(slots, userCorpus);
  const filters: GemmaCatalogSearchFilters = {text: text || undefined};
  if (slots.metal?.trim()) filters.metal = [slots.metal.trim()];
  if (slots.stone?.trim()) filters.stone = [slots.stone.trim()];
  if (priceMaxMinor !== undefined) {
    filters.priceMax = moneyFromMinor(priceMaxMinor);
  }
  return filters;
}

export function sortMatchesByMinVariantPrice(matches: import('../../facts/types').ProductMatch[]) {
  return matches
    .map((m) => {
      const variants = m.matchingVariants.length ? m.matchingVariants : m.product.variants;
      const minors = variants.map((v) => v.price.minor ?? v.price.amount_minor ?? 0);
      const minMinor = minors.length ? Math.min(...minors) : 0;
      return {match: m, minMinor};
    })
    .sort((a, b) => a.minMinor - b.minMinor);
}
