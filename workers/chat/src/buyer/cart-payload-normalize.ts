import {extractCartObject, isFlatUcpCartRecord} from '../cart/ucp-cart';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * UCP po presentCartForChat: płaski cart_id + line_items — owijka dla extractCartObject.
 * structuredContent z płaskim koszykiem UCP (bez .cart) nie blokuje ekstrakcji —
 * https://ucp.dev/2026-08-25/specification/shopping/cart/mcp/
 */
export function normalizeCartPayloadForParsing(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const rec = payload as Record<string, unknown>;
  if (isRecord(rec.structuredContent) && isFlatUcpCartRecord(rec.structuredContent)) {
    return payload;
  }
  if (rec.structuredContent || rec.cart) return payload;
  // Płaski UCP z id koszyka — nie owijaj (zachowaj attribution/buyer/context).
  if (isFlatUcpCartRecord(rec)) return payload;
  const hasLines = Array.isArray(rec.line_items) && rec.line_items.length > 0;
  const hasId = typeof rec.cart_id === 'string' && rec.cart_id.trim();
  if (!hasLines && !hasId) return payload;
  return {
    cart: {
      id: hasId ? rec.cart_id : undefined,
      line_items: rec.line_items ?? [],
      continue_url: rec.continue_url ?? rec.checkout_url,
      ...(rec.attribution !== undefined ? {attribution: rec.attribution} : {}),
      ...(rec.buyer !== undefined ? {buyer: rec.buyer} : {}),
      ...(rec.context !== undefined ? {context: rec.context} : {}),
    },
  };
}

export function continueUrlFromCartPayload(payload: unknown): string | null {
  const norm = normalizeCartPayloadForParsing(payload);
  const cart = extractCartObject(norm);
  if (!cart) return null;
  const raw = cart.continue_url ?? cart.checkout_url;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}
