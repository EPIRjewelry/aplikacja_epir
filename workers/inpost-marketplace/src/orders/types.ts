/** Portal OrderEventType values we may act on for Shopify create (ADR: customer after ACCEPTED+paid). */
export const SHOPIFY_CREATE_EVENT_TYPES = new Set(['ACCEPTED', 'PAID']);

export type ShopifyOrderPlanStatus =
  | 'created'
  | 'duplicate'
  | 'unmatched_sku'
  | 'missing_marketplace_id'
  | 'error'
  | 'skipped_event_type';

export interface ShopifyMoneyPlan {
  amount: number;
  currency: string;
}

export interface ShopifyLineItemPlan {
  sku: string;
  quantity: number;
  title?: string;
  unitAmount?: number;
  currency?: string;
  /** Filled after Admin variant lookup (live path). */
  variantId?: string;
}

export interface ShopifyAddressPlan {
  firstName?: string;
  lastName?: string;
  address1?: string;
  address2?: string;
  city?: string;
  zip?: string;
  province?: string;
  countryCode?: string;
  phone?: string;
}

export interface ShopifyOrderCreateInputPlan {
  email?: string;
  phone?: string;
  note: string;
  tags: string[];
  sourceName: string;
  customAttributes: Array<{ key: string; value: string }>;
  lineItems: ShopifyLineItemPlan[];
  shippingAddress?: ShopifyAddressPlan;
  total?: ShopifyMoneyPlan;
  shippingPrice?: ShopifyMoneyPlan;
  financialStatus: 'PAID';
}

export interface ShopifyOrderPlan {
  status: ShopifyOrderPlanStatus;
  source: string;
  tags: string[];
  idempotencyKey: string | null;
  marketplaceOrderId: string | null;
  eventId: string | null;
  orderEventType: string | null;
  note: string;
  unmatchedSkus?: string[];
  orderCreateInput?: ShopifyOrderCreateInputPlan;
  shopifyOrderGid?: string | null;
}
