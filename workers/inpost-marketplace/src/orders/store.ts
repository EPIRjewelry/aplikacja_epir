/// <reference types="@cloudflare/workers-types" />

import type { ShopifyOrderPlanStatus } from './types';

const POLL_STATE_ID = 1;

export interface PollWatermark {
  eventId: string;
  occurredAt: string | null;
}

export interface ProcessedOrderRow {
  marketplace_order_id: string;
  idempotency_key: string;
  shopify_order_gid: string | null;
  status: string;
  event_id: string | null;
  last_error: string | null;
  updated_at_ms: number;
}

export async function getPollWatermark(db: D1Database): Promise<PollWatermark | null> {
  const row = await db
    .prepare(
      'SELECT last_success_event_id, last_success_occurred_at FROM inpsa_poll_state WHERE id = ?',
    )
    .bind(POLL_STATE_ID)
    .first<{ last_success_event_id: string | null; last_success_occurred_at: string | null }>();
  const eventId = row?.last_success_event_id?.trim();
  if (!eventId) return null;
  const occurredAt = row?.last_success_occurred_at?.trim() || null;
  return { eventId, occurredAt };
}

export async function getLastSuccessEventId(db: D1Database): Promise<string | null> {
  const watermark = await getPollWatermark(db);
  return watermark?.eventId ?? null;
}

export async function setLastSuccessEventId(
  db: D1Database,
  eventId: string,
  occurredAt: string | null,
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO inpsa_poll_state (id, last_success_event_id, last_success_occurred_at, updated_at_ms)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_success_event_id = excluded.last_success_event_id,
         last_success_occurred_at = excluded.last_success_occurred_at,
         updated_at_ms = excluded.updated_at_ms`,
    )
    .bind(POLL_STATE_ID, eventId, occurredAt, now)
    .run();
}

export async function getProcessedByIdempotencyKey(
  db: D1Database,
  idempotencyKey: string,
): Promise<ProcessedOrderRow | null> {
  const row = await db
    .prepare(
      `SELECT marketplace_order_id, idempotency_key, shopify_order_gid, status, event_id, last_error, updated_at_ms
       FROM inpsa_processed_orders WHERE idempotency_key = ?`,
    )
    .bind(idempotencyKey)
    .first<ProcessedOrderRow>();
  return row ?? null;
}

export async function listRetryableOrders(db: D1Database): Promise<ProcessedOrderRow[]> {
  const result = await db
    .prepare(
      `SELECT marketplace_order_id, idempotency_key, shopify_order_gid, status, event_id, last_error, updated_at_ms
       FROM inpsa_processed_orders WHERE status IN ('pending', 'unmatched_sku', 'error')`,
    )
    .all<ProcessedOrderRow>();
  return result.results ?? [];
}

/**
 * Insert a new row. UNIQUE conflict throws (no ON CONFLICT DO UPDATE — do not overwrite).
 */
export async function insertProcessedOrder(
  db: D1Database,
  input: {
    marketplaceOrderId: string;
    idempotencyKey: string;
    shopifyOrderGid: string | null;
    status: ShopifyOrderPlanStatus | 'pending';
    eventId: string | null;
    lastError: string | null;
  },
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO inpsa_processed_orders
        (marketplace_order_id, idempotency_key, shopify_order_gid, status, event_id, last_error, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.marketplaceOrderId,
      input.idempotencyKey,
      input.shopifyOrderGid,
      input.status,
      input.eventId,
      input.lastError,
      now,
    )
    .run();
}

export async function updateProcessedOrder(
  db: D1Database,
  input: {
    marketplaceOrderId: string;
    shopifyOrderGid: string | null;
    status: string;
    eventId: string | null;
    lastError: string | null;
  },
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE inpsa_processed_orders
       SET shopify_order_gid = ?, status = ?, event_id = ?, last_error = ?, updated_at_ms = ?
       WHERE marketplace_order_id = ?`,
    )
    .bind(
      input.shopifyOrderGid,
      input.status,
      input.eventId,
      input.lastError,
      now,
      input.marketplaceOrderId,
    )
    .run();
}

export function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /UNIQUE/i.test(message);
}
