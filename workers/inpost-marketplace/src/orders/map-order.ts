import type { InpsaOrder, InpsaOrderEvent, InpsaOrderLine } from '../inpsa-types';
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

function mapLine(line: InpsaOrderLine, index: number): ShopifyLineItemPlan | { error: string } {
  const sku = line.offer?.product?.sku?.trim();
  if (!sku) {
    return { error: `orderLines[${index}]: missing offer.product.sku (OpenAPI)` };
  }
  if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0) {
    return {
      error: `orderLines[${index}]: missing or invalid quantity (OpenAPI sample omits field — fail closed)`,
    };
  }
  const unit = line.offer?.finalPrice ?? line.offer?.price;
  return {
    sku,
    quantity: line.quantity,
    title: line.offer?.product?.name?.trim() || undefined,
    unitAmount: typeof unit?.amount === 'number' ? unit.amount : undefined,
    currency: unit?.currency?.trim() || undefined,
  };
}

/**
 * Build Shopify orderCreate plan from INPSA order detail (portal fields only).
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
      note: `orderEventType=${orderEventType ?? 'null'} — Shopify create only for ACCEPTED|PAID`,
    };
  }

  if (!order || typeof order.id !== 'string' || !order.id.trim()) {
    return {
      ...base,
      status: 'error',
      note: 'Order detail missing or without id',
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

  const mappedLines: ShopifyLineItemPlan[] = [];
  const unmatchedSkus: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const mapped = mapLine(lines[i], i);
    if ('error' in mapped) {
      if (mapped.error.includes('sku')) {
        unmatchedSkus.push(`line-${i}`);
        return {
          ...base,
          status: 'unmatched_sku',
          unmatchedSkus,
          note: mapped.error,
        };
      }
      return {
        ...base,
        status: 'error',
        note: mapped.error,
      };
    }
    mappedLines.push(mapped);
  }

  const email = order.customer?.email?.trim() || order.delivery?.email?.trim() || undefined;
  const total = order.finalPrice;
  const shippingPrice = order.delivery?.price;

  const orderCreateInput: ShopifyOrderCreateInputPlan = {
    email,
    phone: order.customer?.phoneNumber?.trim() || order.delivery?.phoneNumber?.trim(),
    note: `INPSA marketplace order ${marketplaceOrderId}`,
    tags: [INPOST_VH_ORDER_TAG],
    sourceName: INPOST_VH_ORDER_SOURCE,
    customAttributes: [{ key: 'inpsa_marketplace_order_id', value: marketplaceOrderId }],
    lineItems: mappedLines,
    shippingAddress: mapShippingAddress(order),
    total:
      typeof total?.amount === 'number'
        ? { amount: total.amount, currency: (total.currency ?? 'PLN').trim() || 'PLN' }
        : undefined,
    shippingPrice:
      typeof shippingPrice?.amount === 'number'
        ? {
            amount: shippingPrice.amount,
            currency: (shippingPrice.currency ?? 'PLN').trim() || 'PLN',
          }
        : undefined,
    financialStatus: 'PAID',
  };

  if (orderCreateInput.total && orderCreateInput.total.currency !== 'PLN') {
    return {
      ...base,
      status: 'error',
      note: `Expected currency PLN, got ${orderCreateInput.total.currency}`,
      orderCreateInput,
    };
  }

  return {
    ...base,
    status: 'created',
    note: 'Mapped from INPSA order detail — ready for orderCreate (or dry-run plan)',
    orderCreateInput,
  };
}
