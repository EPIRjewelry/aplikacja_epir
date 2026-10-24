import type { InpsaOrderEvent } from '../inpsa-types';

/**
 * Marketplace order id from INPSA order event — OpenAPI sample:
 * `{ "id": "…", "order": { "id": "AB12345" }, "orderEventType": "…" }`.
 */
export function marketplaceOrderIdFromEvent(event: InpsaOrderEvent): string | null {
  const order = event.order;
  if (order && typeof order === 'object' && typeof order.id === 'string' && order.id.trim()) {
    return order.id.trim();
  }
  return null;
}

export function shopifyIdempotencyKeyForEvent(event: InpsaOrderEvent): string | null {
  const marketplaceId = marketplaceOrderIdFromEvent(event);
  if (!marketplaceId) return null;
  return `inpsa-order:${marketplaceId}`;
}

export function eventIdFromEvent(event: InpsaOrderEvent): string | null {
  if (typeof event.id === 'string' && event.id.trim()) return event.id.trim();
  return null;
}
