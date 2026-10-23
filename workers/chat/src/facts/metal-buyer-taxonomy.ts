function normalizeTaxonomyLabelKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isShopifyTaxonomyGid(value: string): boolean {
  const t = value.trim();
  return (
    t.startsWith('gid://shopify/TaxonomyValue/') ||
    t.startsWith('gid://shopify/Metaobject/')
  );
}

/**
 * Exact `Jewelry material` / shopify.jewelry-material display labels used on epir-online-store.
 * Buyer colloquial slots (intent) map to these sets before taxonomyLabelsExactMatch — no substring/includes.
 *
 * Excluded by design: złocone, pozłacane, gold-plated (not listed under any gold buyer term).
 */
export const EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS = {
  gold585: 'złoto 585',
  gold333: 'złoto 333',
  gold750: 'złoto 750',
  silver925: 'srebro 925',
} as const;

const GOLD_SOLID_LABELS: readonly string[] = [
  EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.gold585,
  EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.gold333,
  EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.gold750,
];

const SILVER_925_LABELS: readonly string[] = [EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.silver925];

/** Normalized buyer term → exact catalog labels (OR within set). */
const BUYER_TERM_TO_EXACT_LABELS: Readonly<Record<string, readonly string[]>> = {
  zloto: GOLD_SOLID_LABELS,
  zloty: GOLD_SOLID_LABELS,
  zlot: GOLD_SOLID_LABELS,
  '585': [EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.gold585],
  '333': [EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.gold333],
  '750': [EPIR_ONLINE_STORE_METAL_TAXONOMY_LABELS.gold750],
  srebro: SILVER_925_LABELS,
  srebrny: SILVER_925_LABELS,
  '925': SILVER_925_LABELS,
};

const KNOWN_EXACT_LABEL_KEYS = new Set<string>([
  ...GOLD_SOLID_LABELS.map((l) => normalizeTaxonomyLabelKey(l)),
  ...SILVER_925_LABELS.map((l) => normalizeTaxonomyLabelKey(l)),
]);

/** All distinct exact labels referenced in the buyer-term map (for ops / audit). */
export function listErpMetalTaxonomyLabelsInBuyerMap(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const labels of Object.values(BUYER_TERM_TO_EXACT_LABELS)) {
    for (const label of labels) {
      const k = normalizeTaxonomyLabelKey(label);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(label);
    }
  }
  return out.sort();
}

/**
 * One intent metal slot → candidate exact taxonomy labels for local post-UCP filter.
 * GIDs pass through; unknown tokens pass through as a single exact candidate (SSOT label from intent).
 */
export function expandBuyerMetalSlotToExactLabels(slotValue: string): string[] {
  const slot = slotValue.trim();
  if (!slot) return [];
  if (isShopifyTaxonomyGid(slot)) return [slot];

  const key = normalizeTaxonomyLabelKey(slot);
  const mapped = BUYER_TERM_TO_EXACT_LABELS[key];
  if (mapped?.length) return [...mapped];

  if (KNOWN_EXACT_LABEL_KEYS.has(key)) return [slot];
  return [slot];
}

export function expandMetalSlotsForMatching(metalSlots: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const slot of metalSlots) {
    for (const label of expandBuyerMetalSlotToExactLabels(slot)) {
      const dedupe = isShopifyTaxonomyGid(label) ? label : normalizeTaxonomyLabelKey(label);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push(label);
    }
  }
  return out;
}
