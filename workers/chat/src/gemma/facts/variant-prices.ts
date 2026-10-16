import type {ProductMatch} from '../../facts/types';
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
