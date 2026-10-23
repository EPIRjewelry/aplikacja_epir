import {variantMetalMatchesSlotTokens} from '../../facts/metal-match';
import type {MoneyPln, ProductMatch} from '../../facts/types';
import type {GemmaVariantPriceFacts, GemmaVariantPriceLine} from './types';

function variantLabel(v: {title?: string; metal?: string | null; size?: string | null}): string {
  const bits = [v.title?.trim(), v.metal, v.size].filter(Boolean);
  return bits.length ? bits.join(', ') : 'wariant';
}

function displayPl(minor: number, display?: string): string {
  const d = display?.trim();
  if (d) return d;
  return `${(minor / 100).toFixed(2).replace('.', ',')} zł`;
}

/**
 * Ceny liczone wyłącznie z matchingVariants (nigdy variants[0] jako cała oferta).
 */
export function buildGemmaVariantPriceFacts(match: ProductMatch): GemmaVariantPriceFacts {
  const variants = match.matchingVariants.length ? match.matchingVariants : match.product.variants;
  const lines: GemmaVariantPriceLine[] = variants.map((v) => {
    const minor = v.price.minor ?? v.price.amount_minor ?? 0;
    return {
      variantId: v.variantId || v.variant_id || '',
      label: variantLabel(v),
      displayPl: displayPl(minor, v.price.display_pl),
      minor,
    };
  });
  if (!lines.length) {
    return {lines: [], isFlat: true, rangeText: null};
  }
  const minors = lines.map((l) => l.minor);
  const minM = Math.min(...minors);
  const maxM = Math.max(...minors);
  const isFlat = minM === maxM;
  const rangeText = isFlat
    ? null
    : `${displayPl(minM, match.matchingPriceRange.min.display_pl)}–${displayPl(
        maxM,
        match.matchingPriceRange.max.display_pl,
      )} (warianty się różnią ceną)`;
  return {lines, isFlat, rangeText};
}

function priceMinor(v: {price?: {minor?: number; amount_minor?: number}}): number {
  return v.price?.minor ?? v.price?.amount_minor ?? 0;
}

/** Warianty pasujące do metalu, ale powyżej priceMax — fakt „ponad budżet” dla modelu B (D6). */
export function overBudgetMetalPriceLines(
  match: ProductMatch,
  metal: string[] | undefined,
  priceMax: MoneyPln | undefined,
): GemmaVariantPriceLine[] {
  if (!metal?.length || priceMax === undefined) return [];
  const maxMinor = priceMax.minor ?? priceMax.amount_minor;
  if (maxMinor === undefined) return [];
  const inBudgetIds = new Set(
    match.matchingVariants.map((v) => v.variantId || v.variant_id || ''),
  );
  const lines: GemmaVariantPriceLine[] = [];
  for (const v of match.product.variants) {
    const id = v.variantId || v.variant_id || '';
    if (!variantMetalMatchesSlotTokens(v.metal, metal)) continue;
    const minor = priceMinor(v);
    if (minor <= maxMinor) continue;
    if (inBudgetIds.has(id)) continue;
    lines.push({
      variantId: id,
      label: variantLabel(v),
      displayPl: `${displayPl(minor, v.price.display_pl)} (ponad budżet)`,
      minor,
    });
  }
  return lines;
}

export function appendOverBudgetToPriceDisplay(
  base: string,
  overLines: GemmaVariantPriceLine[],
): string {
  if (!overLines.length) return base;
  const extra = overLines.map((l) => l.displayPl).join('; ');
  return base ? `${base}; ${extra}` : extra;
}
