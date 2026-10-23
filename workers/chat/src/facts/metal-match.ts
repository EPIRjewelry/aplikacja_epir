import type {ProductFacts} from './types';

export function normalizeMaterialText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Tokeny z etykiet taxonomy / opcji (spacje i przecinki; „gold-plated” = jeden token). */
export function materialTokensFromText(text: string): Set<string> {
  const normalized = normalizeMaterialText(text);
  if (!normalized) return new Set();
  const parts = normalized.split(/[\s,]+/u).map((p) => p.trim()).filter(Boolean);
  return new Set(parts);
}

/** Slot metalu vs etykieta — pełne tokeny (np. złoto ≠ złocone; gold ≠ gold-plated). */
export function materialLabelMatchesSlotTokens(haystack: string, metalTokens: string[]): boolean {
  const words = materialTokensFromText(haystack);
  if (!words.size) return false;
  for (const token of metalTokens) {
    const tokenParts = [...materialTokensFromText(token)];
    if (!tokenParts.length) continue;
    if (tokenParts.every((w) => words.has(w))) return true;
  }
  return false;
}

export function variantMetalMatchesSlotTokens(
  variantMetal: string | null | undefined,
  metalTokens: string[],
): boolean {
  if (!metalTokens.length) return true;
  if (!variantMetal?.trim()) return false;
  return materialLabelMatchesSlotTokens(variantMetal.trim(), metalTokens);
}

/** Fakt materiału produktu (nie opcja wariantu): metals[] + znane metapola. */
export function productMaterialFactText(product: ProductFacts): string {
  const chunks: string[] = [];
  for (const m of product.metals) {
    if (m?.trim()) chunks.push(m.trim());
  }
  const customMetal = product.metafields['custom.metal'];
  if (typeof customMetal === 'string' && customMetal.trim()) chunks.push(customMetal.trim());
  const jewelryMaterial = product.metafields['shopify.jewelry-material'];
  if (typeof jewelryMaterial === 'string' && jewelryMaterial.trim()) {
    chunks.push(jewelryMaterial.trim());
  } else if (Array.isArray(jewelryMaterial)) {
    for (const entry of jewelryMaterial) {
      if (String(entry).trim()) chunks.push(String(entry).trim());
    }
  }
  return chunks.join(', ');
}

export function productFactsMaterialMatchesTokens(
  product: ProductFacts,
  metalTokens: string[],
): boolean {
  return materialLabelMatchesSlotTokens(productMaterialFactText(product), metalTokens);
}
