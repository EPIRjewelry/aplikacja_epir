import type { InpsaMoney, InpsaOrder, InpsaOrderEvent, InpsaOrderLine } from '../inpsa-types';
import { INPOST_VH_ORDER_SOURCE, INPOST_VH_ORDER_TAG } from './constants';
import {
  eventIdFromEvent,
  marketplaceOrderIdFromEvent,
  shopifyIdempotencyKeyForEvent,
} from './idempotency';
import {
  SHOPIFY_CREATE_EVENT_TYPES,
  type ShopifyAddressPlan,
  type ShopifyLineItemPlan,
  type ShopifyOrderCreateInputPlan,
  type ShopifyOrderPlan,
} from './types';

function formatAddress1(address: NonNullable<InpsaOrder['delivery']>['address']): string | undefined {
  if (!address) return undefined;
  const street = address.street?.trim() ?? '';
  const building = address.building?.trim() ?? '';
  const parts = [street, building].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

function mapShippingAddress(order: InpsaOrder): ShopifyAddressPlan | undefined {
  const delivery = order.delivery;
  const customer = order.customer;
  const address = delivery?.address ?? customer?.address;
  if (!delivery && !customer && !address) return undefined;

  const name = delivery?.name?.trim() ?? '';
  const [firstFromName, ...restName] = name.split(/\s+/).filter(Boolean);
  const firstName = customer?.firstName?.trim() || firstFromName;
  const lastName =
    customer?.lastName?.trim() || (restName.length ? restName.join(' ') : undefined);

  return {
    firstName,
    lastName,
    address1: formatAddress1(address),
    address2: address?.flat?.trim() || undefined,
    city: address?.city?.trim() || undefined,
    zip: address?.postCode?.trim() || undefined,
    province: address?.state?.trim() || undefined,
    countryCode: address?.countryCode?.trim() || undefined,
    phone: delivery?.phoneNumber?.trim() || customer?.phoneNumber?.trim() || undefined,
  };
}

function moneyOrError(
  money: InpsaMoney | undefined,
  label: string,
): { amount: number; currency: string } | { error: string } {
  if (typeof money?.amount !== 'number' || !Number.isFinite(money.amount)) {
    return { error: `${label}: missing amount` };
  }
  const currency = money.currency?.trim();
  if (!currency) {
    return { error: `${label}: missing currency` };
  }
  if (currency !== 'PLN') {
    return { error: `${label}: expected currency PLN, got ${currency}` };
  }
  return { amount: money.amount, currency };
}

/**
 * OpenAPI line has no quantity. Group units of the same offer (else SKU).
 * Unit price is offer.price.amount (FAQ); finalPrice only when price is absent.
 */
export function groupOrderLines(
  lines: InpsaOrderLine[],
): { lines: ShopifyLineItemPlan[] } | { error: string; unmatched?: boolean } {
  const groups = new Map<string, ShopifyLineItemPlan>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sku = line.offer?.product?.sku?.trim();
    if (!sku) {
      return { error: `orderLines[${i}]: missing offer.product.sku (OpenAPI)`, unmatched: true };
    }
    const offerId = line.offer?.offerId?.trim();
    const key = offerId ? `offer:${offerId}` : `sku:${sku}`;
    const priced = line.offer?.price ?? line.offer?.finalPrice;
    const unit = moneyOrError(priced, `orderLines[${i}].offer.price`);
    if ('error' in unit) return unit;

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        sku,
        quantity: 1,
        title: line.offer?.product?.name?.trim() || undefined,
        unitAmount: unit.amount,
        currency: unit.currency,
      });
      continue;
    }
    if (existing.sku !== sku) {
      return { error: `orderLines[${i}]: offer ${offerId} grouped SKUs differ` };
    }
    if (existing.unitAmount !== unit.amount) {
      return { error: `orderLines[${i}]: mixed unit price for ${key}` };
    }
    existing.quantity += 1;
  }

  return { lines: [...groups.values()] };
}

/**
 * Build Shopify orderCreate plan from INPSA order detail (portal fields only).
 * Shopify create is only for PAID. ACCEPTED/CREATED are skipped here.
 */
export function mapInpsaOrderToShopifyPlan(
  event: InpsaOrderEvent,
  order: InpsaOrder | null,
): ShopifyOrderPlan {
  const marketplaceOrderId = marketplaceOrderIdFromEvent(event);
  const idempotencyKey = shopifyIdempotencyKeyForEvent(event);
  const eventId = eventIdFromEvent(event);
  const orderEventType =
    typeof event.orderEventType === 'string' ? event.orderEventType.trim() : null;

  const base = {
    source: INPOST_VH_ORDER_SOURCE,
    tags: [INPOST_VH_ORDER_TAG],
    idempotencyKey,
    marketplaceOrderId,
    eventId,
    orderEventType,
  };

  if (!marketplaceOrderId || !idempotencyKey) {
    return {
      ...base,
      status: 'missing_marketplace_id',
      note: 'Event missing order.id (OpenAPI: data[].order.id)',
    };
  }

  if (!orderEventType || !SHOPIFY_CREATE_EVENT_TYPES.has(orderEventType)) {
    return {
      ...base,
      status: 'skipped_event_type',
      note: `orderEventType=${orderEventType ?? 'null'} — Shopify create only for PAID`,
    };
  }

  if (!order || typeof order.id !== 'string' || !order.id.trim()) {
    return {
      ...base,
      status: 'error',
      note: 'Order detail missing or without id',
    };
  }

  const payments = order.paymentDetails?.payments;
  if (!Array.isArray(payments) || payments.length === 0) {
    return {
      ...base,
      status: 'error',
      note: 'PAID event but paymentDetails.payments is empty',
    };
  }

  const lines = order.orderLines ?? [];
  if (!lines.length) {
    return {
      ...base,
      status: 'error',
      note: 'Order has no orderLines',
    };
  }

  const grouped = groupOrderLines(lines);
  if ('error' in grouped) {
    return {
      ...base,
      status: grouped.unmatched ? 'unmatched_sku' : 'error',
      unmatchedSkus: grouped.unmatched ? [`line`] : undefined,
      note: grouped.error,
    };
  }

  const email = order.customer?.email?.trim() || order.delivery?.email?.trim() || undefined;
  let shippingPrice: ShopifyOrderCreateInputPlan['shippingPrice'];
  if (order.delivery?.price && typeof order.delivery.price.amount === 'number') {
    const shipping = moneyOrError(order.delivery.price, 'delivery.price');
    if ('error' in shipping) {
      return { ...base, status: 'error', note: shipping.error };
    }
    shippingPrice = shipping;
  }

  const goods = grouped.lines.reduce((sum, line) => sum + (line.unitAmount ?? 0) * line.quantity, 0);
  const transactionAmount = goods + (shippingPrice?.amount ?? 0);

  const orderCreateInput: ShopifyOrderCreateInputPlan = {
    email,
    phone: order.customer?.phoneNumber?.trim() || order.delivery?.phoneNumber?.trim(),
    note: `INPSA marketplace order ${marketplaceOrderId}`,
    tags: [INPOST_VH_ORDER_TAG],
    sourceName: INPOST_VH_ORDER_SOURCE,
    customAttributes: [{ key: 'inpsa_marketplace_order_id', value: marketplaceOrderId }],
    lineItems: grouped.lines,
    shippingAddress: mapShippingAddress(order),
    shippingPrice,
    transactionAmount,
    financialStatus: 'PAID',
  };

  return {
    ...base,
    status: 'created',
    note: 'Mapped from INPSA order detail — ready for orderCreate (or dry-run plan)',
    orderCreateInput,
  };
}
