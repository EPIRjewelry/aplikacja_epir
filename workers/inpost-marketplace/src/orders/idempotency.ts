import type { InpsaOrderEventRecord } from '../inpsa-api';

/**
 * Idempotency key for Shopify create — marketplace order id from INPSA payload.
 * Exact JSON field path: confirm on portal when mapping UC v1.
 */
export function marketplaceOrderIdFromEvent(event: InpsaOrderEventRecord): string | null {
  const candidates = [
    event.orderId,
    event.order_id,
    event.id,
    (event.order as Record<string, unknown> | undefined)?.id,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

export function shopifyIdempotencyKeyForEvent(event: InpsaOrderEventRecord): string | null {
  const marketplaceId = marketplaceOrderIdFromEvent(event);
  if (!marketplaceId) return null;
  return `inpsa-order:${marketplaceId}`;
}
