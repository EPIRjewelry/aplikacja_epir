/**
 * Parsowanie pathname storefrontu — kontekst czatu (kolekcja / produkt).
 * Lustrzane z workers/chat/src/storefront/path-context.ts.
 */
export type ChatPathContext = {
  collectionHandle?: string;
  productHandle?: string;
};

export function parseChatPathContext(pathname: string): ChatPathContext {
  const normalized = pathname.trim().replace(/\/+$/, '') || '/';
  const collectionMatch = normalized.match(/^\/collections\/([^/?#]+)/);
  const productMatch = normalized.match(/^\/products\/([^/?#]+)/);
  const out: ChatPathContext = {};
  if (collectionMatch?.[1]) out.collectionHandle = decodeURIComponent(collectionMatch[1]);
  if (productMatch?.[1]) out.productHandle = decodeURIComponent(productMatch[1]);
  return out;
}
