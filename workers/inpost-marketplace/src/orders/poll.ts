import type { Env } from '../env';
import {
  InpsaApiClient,
  countOrderEvents,
  extractOrderEvents,
  type InpsaOrderEvent,
} from '../inpsa-api';
import type { InpsaOrder } from '../inpsa-types';
import { eventIdFromEvent, marketplaceOrderIdFromEvent } from './idempotency';
import { mapInpsaOrderToShopifyPlan } from './map-order';
import { createShopifyAdminClient, type FetchFn, type ShopifyAdminClients } from './shopify-admin';
import {
  getPollWatermark,
  getProcessedByIdempotencyKey,
  insertProcessedOrder,
  isUniqueViolation,
  setLastSuccessEventId,
  updateProcessedOrder,
  type PollWatermark,
} from './store';
import { MAX_EVENT_PAGES, PENDING_RETRY_MS, type ShopifyOrderPlan } from './types';

export interface PollOrdersEventsResult {
  httpStatus: number;
  dryRun: boolean;
  lastSuccessEventId: string | null;
  events: InpsaOrderEvent[];
  shopifyPlans: ShopifyOrderPlan[];
  /** Event ids that failed mapping or Shopify create. Ids only. */
  failedEventIds: string[];
}

export interface PollOrdersEventsOptions {
  limit?: number;
  /** Manual single-page override. Watermark walk does not use this. */
  untilId?: string;
  dryRun?: boolean;
  fetchFn?: FetchFn;
}

export interface ReconcileOrdersResult {
  dryRun: boolean;
  pages: number;
  importedOrderIds: string[];
  failedOrderIds: string[];
}

function chronological(events: InpsaOrderEvent[]): InpsaOrderEvent[] {
  return [...events].sort((a, b) => {
    const ta = a.occurredAt ? Date.parse(a.occurredAt) : 0;
    const tb = b.occurredAt ? Date.parse(b.occurredAt) : 0;
    if (ta !== tb) return ta - tb;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
}

/** Newer than the saved event. The saved id itself is not newer. */
export function isNewerThanWatermark(event: InpsaOrderEvent, watermark: PollWatermark | null): boolean {
  if (!watermark) return true;
  const id = eventIdFromEvent(event);
  if (id && id === watermark.eventId) return false;
  if (!watermark.occurredAt || !event.occurredAt) return true;
  const eventMs = Date.parse(event.occurredAt);
  const savedMs = Date.parse(watermark.occurredAt);
  if (!Number.isFinite(eventMs) || !Number.isFinite(savedMs)) return true;
  if (eventMs > savedMs) return true;
  if (eventMs < savedMs) return false;
  return true;
}

function planBase(event: InpsaOrderEvent, status: ShopifyOrderPlan['status'], note: string): ShopifyOrderPlan {
  const marketplaceOrderId = marketplaceOrderIdFromEvent(event);
  return {
    status,
    source: 'inpost-vh',
    tags: ['inpost-vh'],
    idempotencyKey: marketplaceOrderId ? `inpsa-order:${marketplaceOrderId}` : null,
    marketplaceOrderId,
    eventId: eventIdFromEvent(event),
    orderEventType: typeof event.orderEventType === 'string' ? event.orderEventType : null,
    note,
  };
}

async function advance(env: Env, dryRun: boolean, event: InpsaOrderEvent): Promise<string | null> {
  const eventId = eventIdFromEvent(event);
  if (dryRun || !env.INPSA_ORDERS_DB || !eventId) return null;
  await setLastSuccessEventId(env.INPSA_ORDERS_DB, eventId, event.occurredAt ?? null);
  return eventId;
}

async function rememberFailure(env: Env, dryRun: boolean, plan: ShopifyOrderPlan): Promise<void> {
  if (dryRun || !env.INPSA_ORDERS_DB || !plan.marketplaceOrderId || !plan.idempotencyKey) return;
  if (plan.status !== 'unmatched_sku' && plan.status !== 'error') return;
  const existing = await getProcessedByIdempotencyKey(env.INPSA_ORDERS_DB, plan.idempotencyKey);
  if (!existing) {
    try {
      await insertProcessedOrder(env.INPSA_ORDERS_DB, {
        marketplaceOrderId: plan.marketplaceOrderId,
        idempotencyKey: plan.idempotencyKey,
        shopifyOrderGid: null,
        status: plan.status,
        eventId: plan.eventId,
        lastError: plan.note,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    return;
  }
  if (existing.status === 'created' || existing.status === 'pending') return;
  await updateProcessedOrder(env.INPSA_ORDERS_DB, {
    marketplaceOrderId: plan.marketplaceOrderId,
    shopifyOrderGid: existing.shopify_order_gid,
    status: plan.status,
    eventId: plan.eventId,
    lastError: plan.note,
  });
}

/**
 * FAQ: events are newest-first; untilId returns only older than that id.
 * First page has no untilId. If the watermark is not on the page, page backward.
 */
export async function collectEventsNewerThan(
  client: InpsaApiClient,
  watermark: PollWatermark | null,
  pageSize: number,
  forcedUntilId?: string,
): Promise<{ httpStatus: number; events: InpsaOrderEvent[] }> {
  if (forcedUntilId) {
    const poll = await client.fetchOrdersEvents({ limit: pageSize, untilId: forcedUntilId });
    return { httpStatus: poll.status, events: chronological(extractOrderEvents(poll.body)) };
  }

  const collected: InpsaOrderEvent[] = [];
  let untilId: string | undefined;
  let httpStatus = 200;

  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const poll = await client.fetchOrdersEvents({ limit: pageSize, untilId });
    httpStatus = poll.status;
    if (poll.status < 200 || poll.status >= 300) break;
    const batch = extractOrderEvents(poll.body);
    collected.push(...batch);
    if (!watermark) break;
    if (batch.some((event) => eventIdFromEvent(event) === watermark.eventId)) break;
    if (batch.length < pageSize) break;
    const oldestId = eventIdFromEvent(batch[batch.length - 1] ?? {});
    if (!oldestId || oldestId === untilId) break;
    untilId = oldestId;
  }

  const newer = collected.filter((event) => isNewerThanWatermark(event, watermark));
  return { httpStatus, events: chronological(newer) };
}

async function loadShopify(env: Env, dryRun: boolean, fetchFn: FetchFn): Promise<ShopifyAdminClients | null> {
  if (dryRun || !env.SHOPIFY_ADMIN_TOKEN?.trim()) return null;
  return createShopifyAdminClient(env, fetchFn);
}

async function createFromPlan(
  env: Env,
  shopify: ShopifyAdminClients,
  plan: ShopifyOrderPlan,
): Promise<ShopifyOrderPlan> {
  if (!env.INPSA_ORDERS_DB || !plan.orderCreateInput || !plan.marketplaceOrderId || !plan.idempotencyKey) {
    return {
      ...plan,
      status: 'error',
      note: 'Live write requires SHOPIFY_ADMIN_TOKEN, SHOP_DOMAIN, and INPSA_ORDERS_DB',
    };
  }

  const existing = await getProcessedByIdempotencyKey(env.INPSA_ORDERS_DB, plan.idempotencyKey);
  if (existing?.status === 'created') {
    return {
      ...plan,
      status: 'duplicate',
      shopifyOrderGid: existing.shopify_order_gid,
      note: 'Idempotency key already processed',
    };
  }

  if (existing?.status === 'pending') {
    const age = Date.now() - existing.updated_at_ms;
    const found = age >= PENDING_RETRY_MS
      ? await shopify.findOrderByMarketplaceId(plan.marketplaceOrderId)
      : null;
    if (found) {
      await updateProcessedOrder(env.INPSA_ORDERS_DB, {
        marketplaceOrderId: plan.marketplaceOrderId,
        shopifyOrderGid: found,
        status: 'created',
        eventId: plan.eventId,
        lastError: null,
      });
      return { ...plan, status: 'duplicate', shopifyOrderGid: found, note: 'Recovered Shopify order for pending row' };
    }
    if (age < PENDING_RETRY_MS) {
      return { ...plan, status: 'duplicate', note: 'pending row is younger than retry window' };
    }
  }

  const unmatched: string[] = [];
  for (const line of plan.orderCreateInput.lineItems) {
    const variantId = await shopify.resolveVariantIdBySku(line.sku);
    if (!variantId) unmatched.push(line.sku);
    else line.variantId = variantId;
  }
  if (unmatched.length) {
    return {
      ...plan,
      status: 'unmatched_sku',
      unmatchedSkus: unmatched,
      note: `No Shopify variant for SKU(s): ${unmatched.join(', ')}`,
    };
  }

  if (!existing) {
    try {
      await insertProcessedOrder(env.INPSA_ORDERS_DB, {
        marketplaceOrderId: plan.marketplaceOrderId,
        idempotencyKey: plan.idempotencyKey,
        shopifyOrderGid: null,
        status: 'pending',
        eventId: plan.eventId,
        lastError: null,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return { ...plan, status: 'duplicate', note: 'Idempotency insert conflict' };
    }
  }

  let orderGid: string;
  try {
    orderGid = (await shopify.orderCreate(plan.orderCreateInput)).orderGid;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateProcessedOrder(env.INPSA_ORDERS_DB, {
      marketplaceOrderId: plan.marketplaceOrderId,
      shopifyOrderGid: null,
      status: 'error',
      eventId: plan.eventId,
      lastError: message,
    });
    return { ...plan, status: 'error', note: message };
  }

  try {
    await updateProcessedOrder(env.INPSA_ORDERS_DB, {
      marketplaceOrderId: plan.marketplaceOrderId,
      shopifyOrderGid: orderGid,
      status: 'created',
      eventId: plan.eventId,
      lastError: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...plan,
      status: 'error',
      shopifyOrderGid: orderGid,
      note: `D1 update failed after orderCreate: ${message}`,
    };
  }
  return { ...plan, status: 'created', shopifyOrderGid: orderGid, note: 'Shopify orderCreate ok' };
}

/**
 * UC v1: poll INPSA order events → map → dry-run plan or Shopify orderCreate.
 * Cursor walks backward via untilId until the saved event, then processes oldest→newest.
 * dryRun never calls Shopify Admin and never mutates D1.
 * CREATED/ACCEPTED advance the watermark only — they do not insert an idempotency row.
 */
export async function pollOrdersEventsPipeline(
  env: Env,
  options: PollOrdersEventsOptions = {},
): Promise<PollOrdersEventsResult> {
  const dryRun = options.dryRun !== false;
  const fetchFn = options.fetchFn ?? fetch;
  const client = new InpsaApiClient(env, fetchFn);
  const pageSize = options.limit ?? 50;

  const watermark = !dryRun && env.INPSA_ORDERS_DB ? await getPollWatermark(env.INPSA_ORDERS_DB) : null;
  const collected = await collectEventsNewerThan(client, watermark, pageSize, options.untilId);

  const shopifyPlans: ShopifyOrderPlan[] = [];
  const failedEventIds: string[] = [];
  let lastSuccessEventId = watermark?.eventId ?? null;
  const shopify = await loadShopify(env, dryRun, fetchFn);

  for (const event of collected.events) {
    const eventType = typeof event.orderEventType === 'string' ? event.orderEventType.trim() : '';
    const marketplaceOrderId = marketplaceOrderIdFromEvent(event);

    if (!marketplaceOrderId) {
      const missing = mapInpsaOrderToShopifyPlan(event, null);
      shopifyPlans.push(missing);
      if (missing.eventId) failedEventIds.push(missing.eventId);
      const advanced = await advance(env, dryRun, event);
      if (advanced) lastSuccessEventId = advanced;
      continue;
    }

    if (eventType !== 'PAID') {
      shopifyPlans.push(mapInpsaOrderToShopifyPlan(event, null));
      const advanced = await advance(env, dryRun, event);
      if (advanced) lastSuccessEventId = advanced;
      continue;
    }

    const detail = await client.fetchOrder(marketplaceOrderId);
    if (detail.status < 200 || detail.status >= 300 || !detail.body) {
      const failed = planBase(event, 'error', `INPSA order detail HTTP ${detail.status}`);
      shopifyPlans.push(failed);
      if (failed.eventId) failedEventIds.push(failed.eventId);
      await rememberFailure(env, dryRun, failed);
      const advanced = await advance(env, dryRun, event);
      if (advanced) lastSuccessEventId = advanced;
      continue;
    }

    const plan = mapInpsaOrderToShopifyPlan(event, detail.body);
    if (plan.status !== 'created' || !plan.orderCreateInput) {
      shopifyPlans.push(plan);
      if (plan.eventId && (plan.status === 'error' || plan.status === 'unmatched_sku')) {
        failedEventIds.push(plan.eventId);
      }
      await rememberFailure(env, dryRun, plan);
      const advanced = await advance(env, dryRun, event);
      if (advanced) lastSuccessEventId = advanced;
      continue;
    }

    if (dryRun || !shopify) {
      const note = dryRun
        ? 'dryRun=1 — plan only; no Shopify Admin call; D1 unchanged'
        : 'Live write requires SHOPIFY_ADMIN_TOKEN, SHOP_DOMAIN, and INPSA_ORDERS_DB';
      const status = dryRun ? 'created' : 'error';
      shopifyPlans.push({ ...plan, status, note });
      if (!dryRun) {
        if (plan.eventId) failedEventIds.push(plan.eventId);
        await rememberFailure(env, false, { ...plan, status: 'error', note });
      }
      const advanced = await advance(env, dryRun, event);
      if (advanced) lastSuccessEventId = advanced;
      continue;
    }

    const written = await createFromPlan(env, shopify, plan);
    shopifyPlans.push(written);
    if (written.eventId && (written.status === 'error' || written.status === 'unmatched_sku')) {
      failedEventIds.push(written.eventId);
      await rememberFailure(env, false, written);
    }
    const advanced = await advance(env, dryRun, event);
    if (advanced) lastSuccessEventId = advanced;
  }

  return {
    httpStatus: collected.httpStatus,
    dryRun,
    lastSuccessEventId,
    events: collected.events,
    shopifyPlans,
    failedEventIds,
  };
}

async function importPaidOrder(
  env: Env,
  order: InpsaOrder,
  shopify: ShopifyAdminClients | null,
  dryRun: boolean,
): Promise<{ orderId: string; failed: boolean }> {
  const orderId = order.id?.trim() ?? '';
  if (!orderId) return { orderId: '', failed: true };
  const event: InpsaOrderEvent = {
    id: `reconcile:${orderId}`,
    order: { id: orderId },
    orderEventType: 'PAID',
    occurredAt: order.updatedAt,
  };
  const plan = mapInpsaOrderToShopifyPlan(event, order);
  if (plan.status !== 'created' || !plan.orderCreateInput) {
    if (!dryRun) await rememberFailure(env, false, plan);
    return { orderId, failed: true };
  }
  if (dryRun || !shopify) return { orderId, failed: false };
  const existing = env.INPSA_ORDERS_DB && plan.idempotencyKey
    ? await getProcessedByIdempotencyKey(env.INPSA_ORDERS_DB, plan.idempotencyKey)
    : null;
  if (existing?.status === 'created') return { orderId, failed: false };
  const written = await createFromPlan(env, shopify, plan);
  const failed = written.status === 'error' || written.status === 'unmatched_sku';
  if (failed) await rememberFailure(env, false, written);
  return { orderId, failed };
}

/** Ops-only catch-up. No cron. OpenAPI list limit 0–30, paged by offset. */
export async function reconcilePaidOrders(
  env: Env,
  options: { updatedAtGte: string; dryRun?: boolean; fetchFn?: FetchFn; limit?: number },
): Promise<ReconcileOrdersResult> {
  const dryRun = options.dryRun !== false;
  const fetchFn = options.fetchFn ?? fetch;
  const client = new InpsaApiClient(env, fetchFn);
  const shopify = await loadShopify(env, dryRun, fetchFn);
  const importedOrderIds: string[] = [];
  const failedOrderIds: string[] = [];
  let offset = 0;
  let pages = 0;

  for (let page = 0; page < 50; page++) {
    const listed = await client.fetchOrders({
      updatedAtGte: options.updatedAtGte,
      limit: options.limit ?? 30,
      offset,
    });
    pages += 1;
    if (listed.status < 200 || listed.status >= 300 || !listed.body) break;
    const rows = listed.body.data ?? [];
    for (const order of rows) {
      const payments = order.paymentDetails?.payments;
      if (!Array.isArray(payments) || payments.length === 0) continue;
      const result = await importPaidOrder(env, order, shopify, dryRun);
      if (!result.orderId) continue;
      if (result.failed) failedOrderIds.push(result.orderId);
      else importedOrderIds.push(result.orderId);
    }
    offset += rows.length;
    const total = listed.body.page?.total;
    if (rows.length === 0 || (typeof total === 'number' && offset >= total)) break;
  }

  return { dryRun, pages, importedOrderIds, failedOrderIds };
}

export { countOrderEvents, extractOrderEvents };
