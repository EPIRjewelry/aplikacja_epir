import type {ProductFacts} from './types';
import {expandMetalSlotsForMatching} from './metal-buyer-taxonomy';

/**
 * Gemma v2 post-UCP metal filter (decision A).
 *
 * UCP `search_catalog` stays query + price only — Storefront `ProductFilter` / taxonomy
 * metafields are not applied on the MCP transport path. After hydration, metal/stone
 * filters run locally and MUST compare exact Shopify taxonomy / option display labels
 * (or taxonomy/metaobject GID), not substring `includes()` or fuzzy token sets.
 *
 * @see https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/products-collections/filter-products
 * @see https://shopify.dev/docs/api/storefront/latest/queries/search#argument-productfilters
 */

export function normalizeTaxonomyLabelKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function isShopifyTaxonomyGid(value: string): boolean {
  const t = value.trim();
  return (
    t.startsWith('gid://shopify/TaxonomyValue/') ||
    t.startsWith('gid://shopify/Metaobject/')
  );
}

/** Exact equality: normalized display label or identical GID/handle string. */
export function taxonomyLabelsExactMatch(slotValue: string, catalogLabel: string): boolean {
  const slot = slotValue.trim();
  const label = catalogLabel.trim();
  if (!slot || !label) return false;
  if (isShopifyTaxonomyGid(slot) || isShopifyTaxonomyGid(label)) {
    return slot === label;
  }
  return normalizeTaxonomyLabelKey(slot) === normalizeTaxonomyLabelKey(label);
}

function pushUniqueLabel(out: string[], seen: Set<string>, raw: string | null | undefined): void {
  if (!raw?.trim()) return;
  const t = raw.trim();
  const dedupe = isShopifyTaxonomyGid(t) ? t : normalizeTaxonomyLabelKey(t);
  if (seen.has(dedupe)) return;
  seen.add(dedupe);
  out.push(t);
}

/** Discrete labels from variant options + shopify.jewelry-material / custom.metal facts. */
export function listProductTaxonomyMaterialLabels(product: ProductFacts): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of product.variants) {
    pushUniqueLabel(out, seen, v.metal);
  }
  for (const m of product.metals) {
    for (const part of m.split(',')) {
      pushUniqueLabel(out, seen, part);
    }
  }
  const customMetal = product.metafields['custom.metal'];
  if (typeof customMetal === 'string') {
    for (const part of customMetal.split(',')) {
      pushUniqueLabel(out, seen, part);
    }
  }
  const jewelryMaterial = product.metafields['shopify.jewelry-material'];
  if (typeof jewelryMaterial === 'string') {
    for (const part of jewelryMaterial.split(',')) {
      pushUniqueLabel(out, seen, part);
    }
  } else if (Array.isArray(jewelryMaterial)) {
    for (const entry of jewelryMaterial) {
      pushUniqueLabel(out, seen, String(entry));
    }
  }
  return out;
}

export function variantMetalMatchesSlotTokens(
  variantMetal: string | null | undefined,
  metalSlots: string[],
): boolean {
  if (!metalSlots.length) return true;
  if (!variantMetal?.trim()) return false;
  const label = variantMetal.trim();
  const expanded = expandMetalSlotsForMatching(metalSlots);
  return expanded.some((slot) => taxonomyLabelsExactMatch(slot, label));
}

export function productFactsMaterialMatchesTokens(
  product: ProductFacts,
  metalSlots: string[],
): boolean {
  const labels = listProductTaxonomyMaterialLabels(product);
  const expanded = expandMetalSlotsForMatching(metalSlots);
  return expanded.some((slot) => labels.some((catalogLabel) => taxonomyLabelsExactMatch(slot, catalogLabel)));
}

/** @deprecated use listProductTaxonomyMaterialLabels */
export function productMaterialFactText(product: ProductFacts): string {
  return listProductTaxonomyMaterialLabels(product).join(', ');
}
