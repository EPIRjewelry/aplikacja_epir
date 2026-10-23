import type {ProductFacts} from './types';
import {normalizeBuyerMetalTermKey} from './metal-buyer-taxonomy';
import {taxonomyLabelsExactMatch} from './metal-match';

/** Exact gemstone labels from shopify.gemstone-type / custom.main_stone on epir-online-store. */
export const EPIR_ONLINE_STORE_STONE_TAXONOMY_LABELS = {
  garnet: 'Granat',
  sapphire: 'Szafir',
  ruby: 'Rubin',
  diamond: 'Diament',
  amethyst: 'Ametyst',
  topaz: 'Topaz',
  opal: 'Opal',
  pearl: 'Perła',
} as const;

const BUYER_TERM_TO_STONE_LABELS: Readonly<Record<string, readonly string[]>> = {
  granat: [EPIR_ONLINE_STORE_STONE_TAXONOMY_LABELS.garnet, 'granat'],
  szafir: [EPIR_ONLINE_STORE_STONE_TAXONOMY_LABELS.sapphire, 'szafir'],
  rubin: [EPIR_ONLINE_STORE_STONE_TAXONOMY_LABELS.ruby, 'rubin'],
  diament: [EPIR_ONLINE_STORE_STONE_TAXONOMY_LABELS.diamond, 'diament'],
  ametyst: [EPIR_ONLINE_STORE_STONE_TAXONOMY_LABELS.amethyst, 'ametyst'],
  topaz: [EPIR_ONLINE_STORE_STONE_TAXONOMY_LABELS.topaz, 'topaz'],
  opal: [EPIR_ONLINE_STORE_STONE_TAXONOMY_LABELS.opal, 'opal'],
  perla: [EPIR_ONLINE_STORE_STONE_TAXONOMY_LABELS.pearl, 'perła'],
};

function pushUniqueStone(out: string[], seen: Set<string>, raw: string | null | undefined): void {
  if (!raw?.trim()) return;
  const t = raw.trim();
  const dedupe = normalizeBuyerMetalTermKey(t);
  if (seen.has(dedupe)) return;
  seen.add(dedupe);
  out.push(t);
}

export function listProductStoneTaxonomyLabels(product: ProductFacts): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of product.stones) {
    pushUniqueStone(out, seen, s);
  }
  const gemMeta = product.metafields['shopify.gemstone-type'];
  if (typeof gemMeta === 'string') {
    for (const part of gemMeta.split(',')) {
      pushUniqueStone(out, seen, part);
    }
  } else if (Array.isArray(gemMeta)) {
    for (const entry of gemMeta) {
      pushUniqueStone(out, seen, String(entry));
    }
  }
  const mainStone = product.metafields['custom.main_stone'];
  if (typeof mainStone === 'string') {
    pushUniqueStone(out, seen, mainStone);
  }
  return out;
}

export function expandBuyerStoneSlotToExactLabels(slotValue: string): string[] {
  const slot = slotValue.trim();
  if (!slot) return [];
  const key = normalizeBuyerMetalTermKey(slot);
  const mapped = BUYER_TERM_TO_STONE_LABELS[key];
  if (mapped?.length) return [...mapped];
  return [slot];
}

export function expandStoneSlotsForMatching(stoneSlots: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const slot of stoneSlots) {
    for (const label of expandBuyerStoneSlotToExactLabels(slot)) {
      const dedupe = normalizeBuyerMetalTermKey(label);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push(label);
    }
  }
  return out;
}

/** Produkt ma dane kamienia (taxonomy / main_stone) — wtedy exact match; brak → soft-keep. */
export function productHasStoneTaxonomyData(product: ProductFacts): boolean {
  return listProductStoneTaxonomyLabels(product).length > 0;
}

export function productFactsStoneMatchesSlots(
  product: ProductFacts,
  stoneSlots: string[],
): boolean {
  if (!stoneSlots.length) return true;
  const labels = listProductStoneTaxonomyLabels(product);
  if (!labels.length) return true;
  const expanded = expandStoneSlotsForMatching(stoneSlots);
  return expanded.some((slot) =>
    labels.some((catalogLabel) => taxonomyLabelsExactMatch(slot, catalogLabel)),
  );
}
