/** Shopify orderCreate only after INPSA PAID and non-empty paymentDetails.payments. */
export const SHOPIFY_CREATE_EVENT_TYPES = new Set(['PAID']);

/** Pending row older than this is looked up in Shopify before a second orderCreate. */
export const PENDING_RETRY_MS = 15 * 60 * 1000;

/** Safety cap while paging events backward with untilId. */
export const MAX_EVENT_PAGES = 20;

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
  /** Sum of unit×qty plus shipping. Sent as orderCreate transaction amountSet. */
  transactionAmount?: number;
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
