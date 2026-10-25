/** OpenAPI: Order event envelope (`GET …/orders/events` → `data[]`). */
export interface InpsaOrderEvent {
  id?: string;
  order?: { id?: string };
  orderEventType?: string;
  occurredAt?: string;
}

export interface InpsaMoney {
  amount?: number;
  currency?: string;
}

export interface InpsaAddress {
  street?: string;
  city?: string;
  postCode?: string;
  state?: string;
  countryCode?: string;
  building?: string;
  flat?: string;
}

export interface InpsaCustomer {
  email?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  address?: InpsaAddress;
}

export interface InpsaDelivery {
  deliveryType?: string;
  name?: string;
  deliveryPoint?: string;
  address?: InpsaAddress;
  email?: string;
  phoneNumber?: string;
  price?: InpsaMoney;
  courierNote?: string;
}

export interface InpsaOrderLineProduct {
  productId?: string;
  name?: string;
  ean?: string;
  sku?: string;
}

export interface InpsaOrderLineOffer {
  offerId?: string;
  product?: InpsaOrderLineProduct;
  price?: InpsaMoney;
  finalPrice?: InpsaMoney;
  externalId?: string;
}

/**
 * OpenAPI order line (`gokart-api` order sample): only `offer`.
 * No `quantity` and no `lineItemId` (FAQ mentions `lineItemId`; schema sample does not).
 * Each unit is a separate element — Shopify quantity is the count of lines.
 */
export interface InpsaOrderLine {
  offer?: InpsaOrderLineOffer;
}

export interface InpsaPayment {
  paymentId?: string;
  paymentType?: string;
  paymentDate?: string;
}

/** Paid when `payments` is non-empty (FAQ + OpenAPI `paymentDetails`). */
export interface InpsaPaymentDetails {
  selectedPaymentType?: string;
  payments?: InpsaPayment[];
}

export interface InpsaOrder {
  id?: string;
  organizationId?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  customer?: InpsaCustomer;
  delivery?: InpsaDelivery;
  orderLines?: InpsaOrderLine[];
  finalPrice?: InpsaMoney;
  basePrice?: InpsaMoney;
  paymentDetails?: InpsaPaymentDetails;
}

export interface InpsaOrdersListResponse {
  page?: { limit?: number; offset?: number; total?: number };
  data?: InpsaOrder[];
}

export interface InpsaOrdersEventsResponse {
  data?: InpsaOrderEvent[];
  /** Legacy / tolerant parse — OpenAPI sample uses `data`. */
  events?: InpsaOrderEvent[];
  items?: InpsaOrderEvent[];
}
