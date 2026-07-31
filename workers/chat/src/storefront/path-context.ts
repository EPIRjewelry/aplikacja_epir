/**
 * Parsowanie pathname storefrontu Hydrogen (kolekcja / produkt).
 * Używane po stronie workera jako fallback, gdy front nie dosłał handle.
 */
export type StorefrontPathContext = {
  collectionHandle?: string;
  productHandle?: string;
};

export function parseStorefrontPathContext(path: string): StorefrontPathContext {
  const normalized = path.trim().replace(/\/+$/, '') || '/';
  const collectionMatch = normalized.match(/^\/collections\/([^/?#]+)/);
  const productMatch = normalized.match(/^\/products\/([^/?#]+)/);
  const out: StorefrontPathContext = {};
  if (collectionMatch?.[1]) out.collectionHandle = decodeURIComponent(collectionMatch[1]);
  if (productMatch?.[1]) out.productHandle = decodeURIComponent(productMatch[1]);
  return out;
}
