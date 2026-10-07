import type {
  CatalogFacetsDto,
  CatalogFilters,
  MoneyPln,
  ProductFacts,
  ProductMatch,
  VariantFacts,
  VariantStoneOrigin,
} from './types';
import {moneyFromMinor} from './types';

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function priceMinor(v: MoneyPln | number | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return v.minor ?? v.amount_minor;
}

function variantMatchesFilters(v: VariantFacts, filters: CatalogFilters): boolean {
  const availableOnly = filters.availableOnly ?? filters.available;
  if (availableOnly !== undefined && v.available !== availableOnly) return false;

  if (filters.origin?.length) {
    const origin = v.stoneOrigin ?? v.origin;
    if (!origin || !filters.origin.includes(origin)) return false;
  }

  if (filters.metal?.length) {
    if (!v.metal) return false;
    const vMetal = v.metal.trim().toLowerCase();
    if (!filters.metal.some((m) => vMetal.includes(m.toLowerCase()))) return false;
  }

  const min = priceMinor(filters.priceMin);
  const max = priceMinor(filters.priceMax);
  const p = v.price?.minor ?? v.price?.amount_minor;
  if (min !== undefined) {
    if (p === undefined) return false;
    if (p < min) return false;
  }
  if (max !== undefined) {
    if (p === undefined) return false;
    if (p > max) return false;
  }

  if (filters.size) {
    if (!v.size || v.size !== filters.size) return false;
  }

  return true;
}

function productMatchesText(p: ProductFacts, query: string): boolean {
  const normalized = normalizeText(query);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;

  const haystack = normalizeText(
    [p.title, p.productType, p.vendor, ...p.stones, ...p.variants.map((v) => v.title)]
      .filter(Boolean)
      .join(' '),
  );
  return tokens.every((token) => haystack.includes(token));
}

export function filterProducts(products: ProductFacts[], filters: CatalogFilters): ProductMatch[] {
  const matches: ProductMatch[] = [];

  for (const product of products) {
    if (filters.text && !productMatchesText(product, filters.text)) continue;
    if (filters.productType?.length) {
      if (!product.productType || !filters.productType.includes(product.productType)) continue;
    }
    if (filters.stone?.length) {
      if (!filters.stone.some((s) => product.stones.map((x) => x.toLowerCase()).includes(s.toLowerCase()))) {
        continue;
      }
    }

    const matching = product.variants.filter((v) => variantMatchesFilters(v, filters));
    if (!matching.length) continue;

    const prices = matching.map((v) => v.price.minor ?? v.price.amount_minor ?? 0);
    const minM = Math.min(...prices);
    const maxM = Math.max(...prices);
    const isFlat = minM === maxM;

    matches.push({
      product,
      matchingVariants: matching,
      matchingVariantIds: matching.map((v) => v.variantId || v.variant_id || ''),
      matchingPriceRange: {
        min: moneyFromMinor(minM),
        max: moneyFromMinor(maxM),
        isFlat,
      },
      isFlat,
    });
  }

  return matches;
}

export function computeFacetsFromMatches(matches: ProductMatch[]): CatalogFacetsDto {
  const byOrigin: Record<VariantStoneOrigin, number> = {
    natural: 0,
    lab_grown: 0,
    cultured: 0,
    mixed: 0,
    unknown: 0,
  };
  const byMetal: Record<string, number> = {};
  const byStone: Record<string, number> = {};
  const byProductType: Record<string, number> = {};

  for (const match of matches) {
    const origins = new Set<VariantStoneOrigin>();
    for (const v of match.matchingVariants) {
      const o = v.stoneOrigin ?? v.origin;
      if (o) origins.add(o);
      if (v.metal) {
        const key = v.metal.trim().toLowerCase();
        byMetal[key] = (byMetal[key] ?? 0) + 1;
      }
    }
    for (const o of origins) byOrigin[o] = (byOrigin[o] ?? 0) + 1;
    for (const s of match.product.stones) {
      const key = s.toLowerCase();
      byStone[key] = (byStone[key] ?? 0) + 1;
    }
    if (match.product.productType) {
      byProductType[match.product.productType] = (byProductType[match.product.productType] ?? 0) + 1;
    }
  }

  return {total: matches.length, byOrigin, byStone, byMetal, byProductType};
}

/** @deprecated */
export function computeFacets(products: ProductFacts[]): CatalogFacetsDto {
  return computeFacetsFromMatches(
    products.map((p) => ({
      product: p,
      matchingVariants: p.variants,
      matchingVariantIds: p.variants.map((v) => v.variantId),
      matchingPriceRange: p.priceRange,
      isFlat: p.priceRange.isFlat,
    })),
  );
}
