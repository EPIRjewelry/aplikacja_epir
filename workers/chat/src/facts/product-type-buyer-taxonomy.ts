import {normalizeBuyerMetalTermKey} from './metal-buyer-taxonomy';
import {taxonomyLabelsExactMatch} from './metal-match';

/** Exact `product.productType` values on epir-online-store (Admin SSOT). */
export const EPIR_ONLINE_STORE_PRODUCT_TYPES = {
  rings: 'Pierścionki',
  earrings: 'Kolczyki',
  bracelets: 'Bransoletki',
  necklaces: 'Naszyjniki',
  pendants: 'Wisiorki',
} as const;

const BUYER_TERM_TO_PRODUCT_TYPE: Readonly<Record<string, readonly string[]>> = {
  pierscionek: [EPIR_ONLINE_STORE_PRODUCT_TYPES.rings],
  pierscionki: [EPIR_ONLINE_STORE_PRODUCT_TYPES.rings],
  kolczyk: [EPIR_ONLINE_STORE_PRODUCT_TYPES.earrings],
  kolczyki: [EPIR_ONLINE_STORE_PRODUCT_TYPES.earrings],
  bransoletka: [EPIR_ONLINE_STORE_PRODUCT_TYPES.bracelets],
  bransoletki: [EPIR_ONLINE_STORE_PRODUCT_TYPES.bracelets],
  naszyjnik: [EPIR_ONLINE_STORE_PRODUCT_TYPES.necklaces],
  naszyjniki: [EPIR_ONLINE_STORE_PRODUCT_TYPES.necklaces],
  wisiorek: [EPIR_ONLINE_STORE_PRODUCT_TYPES.pendants],
  wisiorki: [EPIR_ONLINE_STORE_PRODUCT_TYPES.pendants],
};

export function expandBuyerProductTypeSlotToExactTypes(slotValue: string): string[] {
  const slot = slotValue.trim();
  if (!slot) return [];
  const key = normalizeBuyerMetalTermKey(slot);
  const mapped = BUYER_TERM_TO_PRODUCT_TYPE[key];
  if (mapped?.length) return [...mapped];
  return [slot];
}

export function expandProductTypeSlotsForMatching(productTypeSlots: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const slot of productTypeSlots) {
    for (const label of expandBuyerProductTypeSlotToExactTypes(slot)) {
      const dedupe = normalizeBuyerMetalTermKey(label);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push(label);
    }
  }
  return out;
}

export function productFactsProductTypeMatchesSlots(
  productType: string | null | undefined,
  productTypeSlots: string[],
): boolean {
  if (!productTypeSlots.length) return true;
  const pt = productType?.trim();
  if (!pt) return false;
  const expanded = expandProductTypeSlotsForMatching(productTypeSlots);
  return expanded.some((slot) => taxonomyLabelsExactMatch(slot, pt));
}
