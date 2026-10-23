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

const ENGAGEMENT_ONLY: readonly string[] = [EPIR_ONLINE_STORE_PRODUCT_TYPES.engagementRing];
const EARRINGS: readonly string[] = [EPIR_ONLINE_STORE_PRODUCT_TYPES.earrings];
const BRACELET: readonly string[] = [EPIR_ONLINE_STORE_PRODUCT_TYPES.bracelet];
const NECKLACE: readonly string[] = [EPIR_ONLINE_STORE_PRODUCT_TYPES.necklace];
const WEDDING_BAND: readonly string[] = [EPIR_ONLINE_STORE_PRODUCT_TYPES.weddingBand];

/**
 * Buyer NL (folded keys via normalizeBuyerMetalTermKey) → Admin productType labels.
 * Allowlist (operator 2026-10-23): neck synonyms → Naszyjnik; engagement-only terms;
 * obrączka / kolczyki (+ existing stems). No bare "biżuteria", "ślub", "wiszące".
 * Intentionally omitted: "wedding ring" / "wedding band" (EN ambiguous; do not map to Obrączka).
 */
const BUYER_TERM_TO_PRODUCT_TYPE: Readonly<Record<string, readonly string[]>> = {
  // Pierścionek (+ zaręczynowy via RING_LABELS)
  pierscionek: RING_LABELS,
  pierscionki: RING_LABELS,
  ring: RING_LABELS,
  rings: RING_LABELS,

  // Pierścionek zaręczynowy only
  zareczynowy: ENGAGEMENT_ONLY,
  zareczynowe: ENGAGEMENT_ONLY,
  'pierscionek zareczynowy': ENGAGEMENT_ONLY,
  'pierscionki zareczynowe': ENGAGEMENT_ONLY,
  engagement: ENGAGEMENT_ONLY,
  'engagement ring': ENGAGEMENT_ONLY,
  'engagement rings': ENGAGEMENT_ONLY,

  // Kolczyki
  kolczyk: EARRINGS,
  kolczyki: EARRINGS,
  earring: EARRINGS,
  earrings: EARRINGS,

  // Bransoletka (existing)
  bransoletka: BRACELET,
  bransoletki: BRACELET,
  bracelet: BRACELET,
  bracelets: BRACELET,

  // Naszyjnik (+ neck synonyms)
  naszyjnik: NECKLACE,
  naszyjniki: NECKLACE,
  necklace: NECKLACE,
  necklaces: NECKLACE,
  wisior: NECKLACE,
  wisiory: NECKLACE,
  wisiorek: NECKLACE,
  wisiorki: NECKLACE,
  lancuszek: NECKLACE,
  lancuszki: NECKLACE,
  lancuch: NECKLACE,
  lancuchy: NECKLACE,
  pendant: NECKLACE,
  pendants: NECKLACE,
  choker: NECKLACE,
  chokers: NECKLACE,

  // Obrączka
  obraczka: WEDDING_BAND,
  obraczki: WEDDING_BAND,
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
