import type { InpsaOrderEventRecord } from '../inpsa-api';
import { marketplaceOrderIdFromEvent, shopifyIdempotencyKeyForEvent } from './idempotency';
import { INPOST_VH_ORDER_SOURCE, INPOST_VH_ORDER_TAG } from './constants';

/** `not_implemented` until Shopify Admin API is wired; no separate ready state yet. */
export type ShopifyOrderPlanStatus = 'missing_marketplace_id' | 'not_implemented';

export interface ShopifyOrderPlan {
  status: ShopifyOrderPlanStatus;
  source: string;
  tags: string[];
  idempotencyKey: string | null;
  marketplaceOrderId: string | null;
  note: string;
}

/**
 * Maps an INPSA order event to the intended Shopify order shape (no Admin API call yet).
 * Customer / delivery.email available only when marketplace order is ACCEPTED and paid (ADR).
 */
export function planShopifyOrderFromEvent(event: InpsaOrderEventRecord): ShopifyOrderPlan {
  const marketplaceOrderId = marketplaceOrderIdFromEvent(event);
  const idempotencyKey = shopifyIdempotencyKeyForEvent(event);

  if (!marketplaceOrderId || !idempotencyKey) {
    return {
      status: 'missing_marketplace_id',
      source: INPOST_VH_ORDER_SOURCE,
      tags: [INPOST_VH_ORDER_TAG],
      idempotencyKey,
      marketplaceOrderId,
      note: 'Cannot derive marketplace order id from event payload — confirm field names from INPSA portal.',
    };
  }

  return {
    status: 'not_implemented',
    source: INPOST_VH_ORDER_SOURCE,
    tags: [INPOST_VH_ORDER_TAG],
    idempotencyKey,
    marketplaceOrderId,
    note:
      'Shopify Admin API create (epir_ai) not wired on this worker. TODO: operator-approved secret/binding + idempotent orderCreate.',
  };
}
