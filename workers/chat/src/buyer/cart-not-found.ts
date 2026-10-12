/**
 * Shopify Cart MCP / UCP: brak koszyka często wraca jako wynik z messages
 * (type=error, code=not_found), nie jako błąd protokołu JSON-RPC.
 * @see https://ucp.dev/2026-08-25/specification/shopping/cart/
 */

import {extractCartObject} from '../cart/ucp-cart';
import {normalizeCartPayloadForParsing} from './cart-payload-normalize';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export const CART_NOT_FOUND_CLIENT_MESSAGE =
  'Nie znajduję aktywnego koszyka. Mogę utworzyć nowy — napisz, jeśli mam dodać wybrany produkt.';

/** True gdy payload get_cart oznacza brak koszyka (messages error not_found). */
export function isCartNotFoundResult(payload: unknown): boolean {
  const normalized = normalizeCartPayloadForParsing(payload);
  const cart = extractCartObject(normalized);

  const messageBags: unknown[] = [];
  if (cart && Array.isArray(cart.messages)) messageBags.push(...cart.messages);
  if (isRecord(payload) && Array.isArray(payload.messages)) {
    messageBags.push(...payload.messages);
  }
  if (isRecord(normalized)) {
    const sc = normalized.structuredContent;
    if (isRecord(sc) && Array.isArray(sc.messages)) messageBags.push(...sc.messages);
  }

  for (const m of messageBags) {
    if (!isRecord(m)) continue;
    const type = typeof m.type === 'string' ? m.type.toLowerCase() : '';
    const code = typeof m.code === 'string' ? m.code.toLowerCase() : '';
    if (type === 'error' && (code === 'not_found' || code.includes('not_found'))) {
      return true;
    }
  }

  if (isRecord(payload) && payload.isError === true) {
    const errCode =
      typeof payload.code === 'string'
        ? payload.code.toLowerCase()
        : isRecord(payload.error) && typeof payload.error.code === 'string'
          ? payload.error.code.toLowerCase()
          : '';
    if (errCode.includes('not_found')) return true;
  }

  return false;
}
