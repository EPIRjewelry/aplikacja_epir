/**
 * Ekstrakcja cart_id / checkout_url z wyników Shopify Storefront MCP
 * oraz wstrzykiwanie cart_id z SessionDO przed wywołaniem get_cart / update_cart.
 */

import { buildCartUrl, parseCartGid } from './cart';

export type CommerceActionPayload = {
  type: 'cart_updated';
  cart_id: string | null;
  checkout_url: string | null;
  line_count: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Ajax `/cart.js` token mapped to GID without `?key=` is not a valid Storefront Cart for MCP.
 */
export function isLikelyAjaxCartFakeGid(cartId: string | null | undefined): boolean {
  if (!cartId || typeof cartId !== 'string') return false;
  const trimmed = cartId.trim();
  if (!trimmed.startsWith('gid://shopify/Cart/')) return false;
  return !/[?&]key=/.test(trimmed);
}

/**
 * Prefer session cart when client sent Ajax-style GID (no key).
 */
export function resolveCartIdForMcp(
  argsCartId: string | null | undefined,
  sessionCartId: string | null | undefined,
): string | null | undefined {
  if (argsCartId && !isLikelyAjaxCartFakeGid(argsCartId)) {
    return argsCartId;
  }
  if (sessionCartId && !isLikelyAjaxCartFakeGid(sessionCartId)) {
    return sessionCartId;
  }
  if (argsCartId && isLikelyAjaxCartFakeGid(argsCartId) && sessionCartId) {
    return sessionCartId;
  }
  return argsCartId ?? sessionCartId ?? undefined;
}

export function injectSessionCartIdIntoArgs(
  toolName: string,
  args: Record<string, unknown>,
  sessionCartId: string | null | undefined,
): Record<string, unknown> {
  if (toolName !== 'get_cart' && toolName !== 'update_cart') {
    return args;
  }
  const next = { ...args };
  const resolved = resolveCartIdForMcp(
    typeof next.cart_id === 'string' ? next.cart_id : undefined,
    sessionCartId,
  );
  if (resolved) {
    next.cart_id = resolved;
  } else {
    delete next.cart_id;
  }
  return next;
}

function countCartLines(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const cart = isRecord(value.cart) ? value.cart : value;
  const lines = cart.lines;
  if (Array.isArray(lines)) return lines.length;
  if (isRecord(lines) && Array.isArray(lines.edges)) return lines.edges.length;
  const totalQuantity = cart.total_quantity ?? cart.totalQuantity;
  if (typeof totalQuantity === 'number' && Number.isFinite(totalQuantity)) {
    return Math.max(0, Math.trunc(totalQuantity));
  }
  return null;
}

export function extractCheckoutUrlFromMcpResult(
  result: unknown,
  shopDomain?: string | null,
): string | null {
  if (!isRecord(result)) return null;

  const direct =
    readString(result, 'checkout_url', 'checkoutUrl') ??
    (isRecord(result.cart) ? readString(result.cart, 'checkout_url', 'checkoutUrl') : null);
  if (direct) return direct;

  const cartId =
    readString(result, 'cart_id', 'id') ??
    (isRecord(result.cart) ? readString(result.cart, 'id', 'cart_id') : null);
  if (cartId && shopDomain) {
    const built = buildCartUrl(shopDomain, cartId);
    if (built) return built;
  }

  if (isRecord(result.cart)) {
    const nestedId = readString(result.cart, 'id', 'cart_id');
    if (nestedId && shopDomain) {
      const built = buildCartUrl(shopDomain, nestedId);
      if (built) return built;
    }
  }

  return null;
}

export function extractCartIdFromMcpResult(result: unknown): string | null {
  if (!isRecord(result)) return null;
  const direct = readString(result, 'cart_id', 'id');
  if (direct?.startsWith('gid://shopify/Cart/')) return direct;
  if (isRecord(result.cart)) {
    const nested = readString(result.cart, 'id', 'cart_id');
    if (nested?.startsWith('gid://shopify/Cart/')) return nested;
  }
  return direct;
}

export function buildCommerceActionPayload(
  result: unknown,
  shopDomain?: string | null,
): CommerceActionPayload | null {
  const cart_id = extractCartIdFromMcpResult(result);
  const checkout_url = extractCheckoutUrlFromMcpResult(result, shopDomain);
  const line_count = countCartLines(result);

  if (!cart_id && !checkout_url) return null;

  return {
    type: 'cart_updated',
    cart_id,
    checkout_url,
    line_count,
  };
}

export function extractSessionCartKey(sessionCartId: string | null | undefined): string | undefined {
  if (!sessionCartId) return undefined;
  const parsed = parseCartGid(sessionCartId);
  return parsed?.key ?? undefined;
}
