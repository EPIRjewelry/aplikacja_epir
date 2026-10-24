import type { Env } from '../env';
import {
  InpsaApiClient,
  countOrderEvents,
  extractOrderEvents,
  type InpsaOrderEvent,
} from '../inpsa-api';
import {
  eventIdFromEvent,
  marketplaceOrderIdFromEvent,
  shopifyIdempotencyKeyForEvent,
} from './idempotency';
import { mapInpsaOrderToShopifyPlan } from './map-order';
import { createShopifyAdminClient, type FetchFn } from './shopify-admin';
import {
  getLastSuccessEventId,
  getProcessedByIdempotencyKey,
  insertProcessedOrder,
  setLastSuccessEventId,
} from './store';
import { SHOPIFY_CREATE_EVENT_TYPES, type ShopifyOrderPlan } from './types';

export interface PollOrdersEventsResult {
  httpStatus: number;
  dryRun: boolean;
  lastSuccessEventId: string | null;
  events: InpsaOrderEvent[];
  shopifyPlans: ShopifyOrderPlan[];
  stoppedEarly?: boolean;
}

export interface PollOrdersEventsOptions {
  limit?: number;
  untilId?: string;
  dryRun?: boolean;
  fetchFn?: FetchFn;
}

function chronological(events: InpsaOrderEvent[]): InpsaOrderEvent[] {
  return [...events].sort((a, b) => {
    const ta = a.occurredAt ? Date.parse(a.occurredAt) : 0;
    const tb = b.occurredAt ? Date.parse(b.occurredAt) : 0;
    if (ta !== tb) return ta - tb;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
}

/**
 * UC v1: poll INPSA order events → map → dry-run plan or Shopify orderCreate.
 * Cursor advances only after created|duplicate. dryRun never calls Shopify Admin / never mutates D1.
 */
export async function pollOrdersEventsPipeline(
  env: Env,
  options: PollOrdersEventsOptions = {},
): Promise<PollOrdersEventsResult> {
  const dryRun = options.dryRun !== false;
  const fetchFn = options.fetchFn ?? fetch;
  const client = new InpsaApiClient(env, fetchFn);

  const storedUntil = !dryRun && env.INPSA_ORDERS_DB
    ? await getLastSuccessEventId(env.INPSA_ORDERS_DB)
    : null;
  const untilId = options.untilId ?? undefined;

  const poll = await client.fetchOrdersEvents({
    limit: options.limit ?? 50,
    untilId,
  });

  const events = chronological(extractOrderEvents(poll.body));
  const shopifyPlans: ShopifyOrderPlan[] = [];
  let lastSuccessEventId = storedUntil;
  let stoppedEarly = false;

  const shopify =
    dryRun || !env.SHOPIFY_ADMIN_TOKEN?.trim()
      ? null
      : createShopifyAdminClient(env, fetchFn);

  for (const event of events) {
    const eventId = eventIdFromEvent(event);
    const marketplaceOrderId = marketplaceOrderIdFromEvent(event);
    const idempotencyKey = shopifyIdempotencyKeyForEvent(event);
    const orderEventType =
      typeof event.orderEventType === 'string' ? event.orderEventType.trim() : null;

    if (!marketplaceOrderId || !idempotencyKey) {
      shopifyPlans.push(
        mapInpsaOrderToShopifyPlan(event, null),
      );
      stoppedEarly = true;
      break;
    }

    if (!dryRun && env.INPSA_ORDERS_DB) {
      const existing = await getProcessedByIdempotencyKey(env.INPSA_ORDERS_DB, idempotencyKey);
      if (existing) {
        const dup: ShopifyOrderPlan = {
          status: 'duplicate',
          source: 'inpost-vh',
          tags: ['inpost-vh'],
          idempotencyKey,
          marketplaceOrderId,
          eventId,
          orderEventType,
          note: 'Idempotency key already processed',
          shopifyOrderGid: existing.shopify_order_gid,
        };
        shopifyPlans.push(dup);
        if (eventId) {
          await setLastSuccessEventId(env.INPSA_ORDERS_DB, eventId);
          lastSuccessEventId = eventId;
        }
        continue;
      }
    }

    if (orderEventType && !SHOPIFY_CREATE_EVENT_TYPES.has(orderEventType)) {
      shopifyPlans.push(mapInpsaOrderToShopifyPlan(event, null));
      if (!dryRun && env.INPSA_ORDERS_DB && eventId) {
        await setLastSuccessEventId(env.INPSA_ORDERS_DB, eventId);
        lastSuccessEventId = eventId;
      }
      continue;
    }

    const detail = await client.fetchOrder(marketplaceOrderId);
    if (detail.status < 200 || detail.status >= 300 || !detail.body) {
      shopifyPlans.push({
        status: 'error',
        source: 'inpost-vh',
        tags: ['inpost-vh'],
        idempotencyKey,
        marketplaceOrderId,
        eventId,
        orderEventType,
        note: `INPSA order detail HTTP ${detail.status}`,
      });
      stoppedEarly = true;
      break;
    }

    let plan = mapInpsaOrderToShopifyPlan(event, detail.body);

    if (plan.status === 'unmatched_sku' || plan.status === 'error' || plan.status === 'missing_marketplace_id') {
      shopifyPlans.push(plan);
      stoppedEarly = true;
      break;
    }

    if (plan.status === 'skipped_event_type') {
      shopifyPlans.push(plan);
      if (!dryRun && env.INPSA_ORDERS_DB && eventId) {
        await setLastSuccessEventId(env.INPSA_ORDERS_DB, eventId);
        lastSuccessEventId = eventId;
      }
      continue;
    }

    // status === 'created' means mapped OK (pre-persist label)
    if (!plan.orderCreateInput) {
      shopifyPlans.push({
        ...plan,
        status: 'error',
        note: 'Mapper returned created without orderCreateInput',
      });
      stoppedEarly = true;
      break;
    }

    if (dryRun) {
      shopifyPlans.push({
        ...plan,
        status: 'created',
        note: 'dryRun=1 — plan only; no Shopify Admin call; D1 unchanged',
      });
      continue;
    }

    if (!shopify || !env.INPSA_ORDERS_DB) {
      shopifyPlans.push({
        ...plan,
        status: 'error',
        note: 'Live write requires SHOPIFY_ADMIN_TOKEN, SHOP_DOMAIN, and INPSA_ORDERS_DB',
      });
      stoppedEarly = true;
      break;
    }

    const unmatched: string[] = [];
    for (const line of plan.orderCreateInput.lineItems) {
      const variantId = await shopify.resolveVariantIdBySku(line.sku);
      if (!variantId) {
        unmatched.push(line.sku);
      } else {
        line.variantId = variantId;
      }
    }
    if (unmatched.length) {
      plan = {
        ...plan,
        status: 'unmatched_sku',
        unmatchedSkus: unmatched,
        note: `No Shopify variant for SKU(s): ${unmatched.join(', ')}`,
      };
      shopifyPlans.push(plan);
      stoppedEarly = true;
      break;
    }

    try {
      const { orderGid } = await shopify.orderCreate(plan.orderCreateInput);
      await insertProcessedOrder(env.INPSA_ORDERS_DB, {
        marketplaceOrderId,
        idempotencyKey,
        shopifyOrderGid: orderGid,
        status: 'created',
      });
      if (eventId) {
        await setLastSuccessEventId(env.INPSA_ORDERS_DB, eventId);
        lastSuccessEventId = eventId;
      }
      shopifyPlans.push({
        ...plan,
        status: 'created',
        shopifyOrderGid: orderGid,
        note: 'Shopify orderCreate ok',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      shopifyPlans.push({
        ...plan,
        status: 'error',
        note: message,
      });
      stoppedEarly = true;
      break;
    }
  }

  return {
    httpStatus: poll.status,
    dryRun,
    lastSuccessEventId,
    events,
    shopifyPlans,
    stoppedEarly: stoppedEarly || undefined,
  };
}

export { countOrderEvents, extractOrderEvents };
