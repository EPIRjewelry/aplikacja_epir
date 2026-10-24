/// <reference types="@cloudflare/workers-types" />

import type { ShopifyOrderPlanStatus } from './types';

const POLL_STATE_ID = 1;

export interface ProcessedOrderRow {
  marketplace_order_id: string;
  idempotency_key: string;
  shopify_order_gid: string | null;
  status: string;
  updated_at_ms: number;
}

export async function getLastSuccessEventId(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare('SELECT last_success_event_id FROM inpsa_poll_state WHERE id = ?')
    .bind(POLL_STATE_ID)
    .first<{ last_success_event_id: string | null }>();
  const id = row?.last_success_event_id?.trim();
  return id ? id : null;
}

export async function setLastSuccessEventId(db: D1Database, eventId: string): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO inpsa_poll_state (id, last_success_event_id, updated_at_ms)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_success_event_id = excluded.last_success_event_id,
         updated_at_ms = excluded.updated_at_ms`,
    )
    .bind(POLL_STATE_ID, eventId, now)
    .run();
}

export async function getProcessedByIdempotencyKey(
  db: D1Database,
  idempotencyKey: string,
): Promise<ProcessedOrderRow | null> {
  const row = await db
    .prepare(
      `SELECT marketplace_order_id, idempotency_key, shopify_order_gid, status, updated_at_ms
       FROM inpsa_processed_orders WHERE idempotency_key = ?`,
    )
    .bind(idempotencyKey)
    .first<ProcessedOrderRow>();
  return row ?? null;
}

export async function insertProcessedOrder(
  db: D1Database,
  input: {
    marketplaceOrderId: string;
    idempotencyKey: string;
    shopifyOrderGid: string | null;
    status: ShopifyOrderPlanStatus;
  },
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO inpsa_processed_orders
        (marketplace_order_id, idempotency_key, shopify_order_gid, status, updated_at_ms)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(marketplace_order_id) DO UPDATE SET
         shopify_order_gid = excluded.shopify_order_gid,
         status = excluded.status,
         updated_at_ms = excluded.updated_at_ms`,
    )
    .bind(
      input.marketplaceOrderId,
      input.idempotencyKey,
      input.shopifyOrderGid,
      input.status,
      now,
    )
    .run();
}
