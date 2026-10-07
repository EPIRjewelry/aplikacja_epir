import type {
  CatalogFacets,
  CatalogFacetsDto,
  CatalogFilters,
  GemstoneOrigin,
  MoneyPln,
  ProductFacts,
  ProductMatch,
  VariantFacts,
} from './types';

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function variantMatchesFilters(v: VariantFacts, filters: CatalogFilters): boolean {
  if (filters.available !== undefined && v.available !== filters.available) return false;
  if (filters.origin?.length) {
    if (!v.origin || !filters.origin.includes(v.origin)) return false;
  }
  if (filters.metal?.length && v.metal) {
    const vMetal = v.metal.trim().toLowerCase();
    if (!filters.metal.some((m) => vMetal.includes(m.toLowerCase()))) return false;
  }
  if (filters.priceMin !== undefined && v.price && v.price.amount_minor < filters.priceMin) return false;
  if (filters.priceMax !== undefined && v.price && v.price.amount_minor > filters.priceMax) return false;
  return true;
}

function productMatchesText(p: ProductFacts, query: string): boolean {
  const normalized = normalizeText(query);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;

  const haystack = normalizeText(
    [p.title, p.vendor, ...(p.variants.map((v) => v.title).filter(Boolean) as string[])].join(' '),
  );

  return tokens.every((token) => haystack.includes(token));
}

export function filterProducts(products: ProductFacts[], filters: CatalogFilters): ProductMatch[] {
  const matches: ProductMatch[] = [];

  for (const product of products) {
    if (filters.text && !productMatchesText(product, filters.text)) continue;

    const matching = product.variants.filter((v) => variantMatchesFilters(v, filters));
    if (!matching.length) continue;

    const prices = matching
      .map((v) => v.price)
      .filter((p): p is MoneyPln => p !== undefined);

    let min: MoneyPln | undefined;
    let max: MoneyPln | undefined;
    let isFlat = true;

    if (prices.length > 0) {
      min = prices.reduce((a, b) => (a.amount_minor <= b.amount_minor ? a : b));
      max = prices.reduce((a, b) => (a.amount_minor >= b.amount_minor ? a : b));
      isFlat = min.amount_minor === max.amount_minor;
    }

    matches.push({
      product,
      matchingVariants: matching,
      matchingPriceRange: min && max ? { min, max } : undefined,
      isFlat,
    });
  }

  return matches;
}

export function computeFacets(products: ProductFacts[]): CatalogFacets {
  const origins = new Map<GemstoneOrigin, number>();
  const metals = new Map<string, number>();
  let globalMin: number | undefined;
  let globalMax: number | undefined;

  for (const product of products) {
    const productOrigins = new Set<GemstoneOrigin>();
    const productMetals = new Set<string>();

    for (const v of product.variants) {
      if (v.origin) productOrigins.add(v.origin);
      if (v.metal) productMetals.add(v.metal.trim().toLowerCase());
      if (v.price) {
        if (globalMin === undefined || v.price.amount_minor < globalMin) {
          globalMin = v.price.amount_minor;
        }
        if (globalMax === undefined || v.price.amount_minor > globalMax) {
          globalMax = v.price.amount_minor;
        }
      }
    }

    for (const o of productOrigins) {
      origins.set(o, (origins.get(o) ?? 0) + 1);
    }
    for (const m of productMetals) {
      metals.set(m, (metals.get(m) ?? 0) + 1);
    }
  }

  return {
    origins,
    metals,
    priceRange: globalMin !== undefined && globalMax !== undefined ? { min: globalMin, max: globalMax } : undefined,
    totalProducts: products.length,
  };
}

export function computeFacetsFromMatches(matches: ProductMatch[]): CatalogFacetsDto {
  const byOrigin: Record<GemstoneOrigin, number> = {
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
    const origins = new Set<GemstoneOrigin>();
    for (const v of match.matchingVariants) {
      if (v.origin) origins.add(v.origin);
      if (v.metal) {
        const key = v.metal.trim().toLowerCase();
        byMetal[key] = (byMetal[key] ?? 0) + 1;
      }
    }
    for (const o of origins) {
      byOrigin[o] = (byOrigin[o] ?? 0) + 1;
    }
  }

  return {
    total: matches.length,
    byOrigin,
    byStone,
    byMetal,
    byProductType,
  };
}
