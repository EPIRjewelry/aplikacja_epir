import {normalizeBuyerMetalTermKey} from './metal-buyer-taxonomy';
import {taxonomyLabelsExactMatch} from './metal-match';

/**
 * Exact `product.productType` values on epir-online-store (Admin / feed SSOT).
 * @see epir-marketing-ingest/config/mapping.json `googleProductCategory.byProductType`
 * + `heroProductTypes` — no plural `Pierścionki` in Admin.
 */
export const EPIR_ONLINE_STORE_PRODUCT_TYPES = {
  ring: 'Pierścionek',
  engagementRing: 'Pierścionek zaręczynowy',
  earrings: 'Kolczyki',
  bracelet: 'Bransoletka',
  necklace: 'Naszyjnik',
  weddingBand: 'Obrączka',
} as const;

const RING_LABELS: readonly string[] = [
  EPIR_ONLINE_STORE_PRODUCT_TYPES.ring,
  EPIR_ONLINE_STORE_PRODUCT_TYPES.engagementRing,
];

const BUYER_TERM_TO_PRODUCT_TYPE: Readonly<Record<string, readonly string[]>> = {
  pierscionek: RING_LABELS,
  pierscionki: RING_LABELS,
  kolczyk: [EPIR_ONLINE_STORE_PRODUCT_TYPES.earrings],
  kolczyki: [EPIR_ONLINE_STORE_PRODUCT_TYPES.earrings],
  bransoletka: [EPIR_ONLINE_STORE_PRODUCT_TYPES.bracelet],
  bransoletki: [EPIR_ONLINE_STORE_PRODUCT_TYPES.bracelet],
  naszyjnik: [EPIR_ONLINE_STORE_PRODUCT_TYPES.necklace],
  naszyjniki: [EPIR_ONLINE_STORE_PRODUCT_TYPES.necklace],
  obraczka: [EPIR_ONLINE_STORE_PRODUCT_TYPES.weddingBand],
  obraczki: [EPIR_ONLINE_STORE_PRODUCT_TYPES.weddingBand],
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
  /** Soft-keep when Admin productType missing — parity metal/stone. */
  if (!pt) return true;
  const expanded = expandProductTypeSlotsForMatching(productTypeSlots);
  return expanded.some((slot) => taxonomyLabelsExactMatch(slot, pt));
}
