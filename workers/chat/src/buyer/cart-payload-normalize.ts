import {extractCartObject} from '../cart/ucp-cart';

/** UCP po presentCartForChat: płaski cart_id + line_items — owijka dla extractCartObject. */
export function normalizeCartPayloadForParsing(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const rec = payload as Record<string, unknown>;
  if (rec.structuredContent || rec.cart) return payload;
  const hasLines = Array.isArray(rec.line_items) && rec.line_items.length > 0;
  const hasId = typeof rec.cart_id === 'string' && rec.cart_id.trim();
  if (!hasLines && !hasId) return payload;
  return {
    cart: {
      id: hasId ? rec.cart_id : undefined,
      line_items: rec.line_items ?? [],
      continue_url: rec.continue_url ?? rec.checkout_url,
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
