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
 * OpenAPI order line. `quantity` is required by our mapper when present;
 * Redoc order samples omit it — fail closed in map-order if missing.
 */
export interface InpsaOrderLine {
  quantity?: number;
  offer?: InpsaOrderLineOffer;
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
}

export interface InpsaOrdersEventsResponse {
  data?: InpsaOrderEvent[];
  /** Legacy / tolerant parse — OpenAPI sample uses `data`. */
  events?: InpsaOrderEvent[];
  items?: InpsaOrderEvent[];
}
