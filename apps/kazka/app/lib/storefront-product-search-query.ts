/** Zapytanie Storefront `products(query:)` — SKU/handle EPIR bez sąsiednich numerów. */
export function storefrontProductSearchQuery(q: string): string {
  const trimmed = q.trim();
  if (!trimmed) return trimmed;
  if (/^\d[\w.-]*-\d[\w.-]*$/.test(trimmed)) {
    return `handle:${trimmed} OR sku:${trimmed}`;
  }
  return trimmed;
}
