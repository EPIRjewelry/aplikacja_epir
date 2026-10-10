import type {ProductFacts, ProductMatch, VariantFacts} from './types';

export const PAGE_PRODUCT_HEADER = '[PRODUKT NA STRONIE]';
export const CATALOG_SEARCH_HEADER = '[WYNIK WYSZUKIWANIA KATALOGU]';
export const TECHNICAL_SECTION_HEADER = '[DANE TECHNICZNE – nie pokazuj klientowi]';

export type ProductBlockFormatInput = {
  product: ProductFacts;
  variants?: VariantFacts[];
  priceRange?: {min: {display_pl?: string}; max: {display_pl?: string}; isFlat: boolean};
};

function formatMetals(product: ProductFacts, variants: VariantFacts[]): string | null {
  const fromProduct = product.metals?.filter(Boolean) ?? [];
  if (fromProduct.length) return fromProduct.join(', ');
  const fromVariants = [...new Set(variants.map((v) => v.metal).filter(Boolean))] as string[];
  return fromVariants.length ? fromVariants.join(', ') : null;
}

function formatStones(product: ProductFacts): string | null {
  const stones = product.stones?.filter(Boolean) ?? [];
  if (stones.length) return stones.join(', ');
  const main = product.metafields?.['custom.main_stone'];
  if (typeof main === 'string' && main.trim()) return main.trim();
  return null;
}

function dimensionLine(product: ProductFacts): string | null {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(product.metafields ?? {})) {
    const k = key.toLowerCase();
    if (!/wymiar|dimension|szerok|wysok|grubo|length|width|height|depth/.test(k)) continue;
    const v = Array.isArray(value) ? value.join(', ') : String(value);
    if (v.trim()) parts.push(`${key}: ${v.trim()}`);
  }
  return parts.length ? parts.join('; ') : null;
}

function formatWeight(variants: VariantFacts[]): string | null {
  const withWeight = variants.filter(
    (v) => v.weight != null && Number.isFinite(v.weight) && v.weightUnit,
  );
  if (!withWeight.length) return null;
  const first = withWeight[0];
  const allSame = withWeight.every(
    (v) => v.weight === first.weight && v.weightUnit === first.weightUnit,
  );
  if (allSame && first.weight != null && first.weightUnit) {
    return `${first.weight} ${first.weightUnit}`;
  }
  return withWeight
    .map((v) => `${v.title || 'wariant'}: ${v.weight} ${v.weightUnit}`)
    .join('; ');
}

function formatPrice(input: ProductBlockFormatInput): string | null {
  const range = input.priceRange ?? input.product.priceRange;
  const min = range.min.display_pl?.trim();
  const max = range.max.display_pl?.trim();
  if (!min && !max) return null;
  if (range.isFlat && min) return min;
  if (min && max && min !== max) {
    return `${min}–${max} (warianty się różnią ceną)`;
  }
  return min ?? max ?? null;
}

function availabilityLabel(variants: VariantFacts[]): string {
  if (!variants.length) return 'nieznana';
  return variants.some((v) => v.available) ? 'dostępny' : 'niedostępny';
}

function variantLabel(v: VariantFacts): string {
  const bits = [v.title?.trim(), v.metal, v.size].filter(Boolean);
  return bits.length ? bits.join(', ') : 'wariant';
}

export function formatSingleProductDescriptive(input: ProductBlockFormatInput): string[] {
  const variants = input.variants?.length ? input.variants : input.product.variants;
  const lines: string[] = [];
  const title = input.product.title?.trim() || 'Produkt';
  lines.push(`- ${title}`);
  const price = formatPrice(input);
  if (price) lines.push(`  cena: ${price}`);
  const metals = formatMetals(input.product, variants);
  if (metals) lines.push(`  metal: ${metals}`);
  const stones = formatStones(input.product);
  if (stones) lines.push(`  kamień: ${stones}`);
  const dims = dimensionLine(input.product);
  if (dims) lines.push(`  wymiary: ${dims}`);
  const weight = formatWeight(variants);
  if (weight) lines.push(`  waga: ${weight}`);
  if (input.product.url) lines.push(`  url: ${input.product.url}`);
  lines.push(`  dostępność: ${availabilityLabel(variants)}`);
  return lines;
}

export function formatProductsBlock(
  header: string,
  items: ProductBlockFormatInput[],
  maxProducts = 6,
): {descriptive: string; technical: string; variantIds: string[]} {
  const variantIds: string[] = [];
  const descriptiveLines: string[] = [header];
  const technicalLines: string[] = [TECHNICAL_SECTION_HEADER];

  for (const item of items.slice(0, maxProducts)) {
    const variants = item.variants?.length ? item.variants : item.product.variants;
    descriptiveLines.push(...formatSingleProductDescriptive(item));
    for (const v of variants) {
      if (!v.variantId) continue;
      variantIds.push(v.variantId);
      technicalLines.push(`  ${variantLabel(v)} → ${v.variantId}`);
    }
  }

  const descriptive = descriptiveLines.join('\n');
  const technical =
    technicalLines.length > 1 ? technicalLines.join('\n') : '';
  return {descriptive, technical, variantIds};
}

export function formatMatchBlock(
  header: string,
  matches: ProductMatch[],
  maxProducts = 6,
): {descriptive: string; technical: string; variantIds: string[]} {
  const items = matches.map((m) => ({
    product: m.product,
    variants: m.matchingVariants.length ? m.matchingVariants : m.product.variants,
    priceRange: m.matchingPriceRange,
  }));
  return formatProductsBlock(header, items, maxProducts);
}
