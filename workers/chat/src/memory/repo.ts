/**
 * D1 repository dla warstwy pamięci klienta: memory_facts, memory_events, memory_raw_turns.
 *
 * Idempotencja przez UNIQUE INDEX'y — `INSERT OR IGNORE` z dedup'em po
 * `(customer, slot, value, source_message_id)` / `(customer, tool_call_id)`.
 */

import type { MemoryEvent, MemoryFact, MemoryRawTurn, FactSlot } from './types';

type D1Row = Record<string, unknown>;

function rowToMemoryFact(row: D1Row): MemoryFact {
  return {
    id: String(row.id ?? ''),
    shopifyCustomerId: String(row.shopify_customer_id ?? ''),
    slot: (row.slot as FactSlot) ?? 'intent',
    value: String(row.value ?? ''),
    valueRaw: (row.value_raw as string | null) ?? null,
    confidence: Number(row.confidence ?? 0),
    sourceSessionId: (row.source_session_id as string | null) ?? null,
    sourceMessageId: (row.source_message_id as string | null) ?? null,
    sourceKind: (row.source_kind as MemoryFact['sourceKind']) ?? 'extractor',
    createdAt: Number(row.created_at ?? 0),
    expiresAt: row.expires_at == null ? null : Number(row.expires_at),
    supersededBy: (row.superseded_by as string | null) ?? null,
  };
}

export async function insertMemoryFact(db: D1Database, fact: MemoryFact): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO memory_facts (
         id, shopify_customer_id, slot, value, value_raw, confidence,
         source_session_id, source_message_id, source_kind,
         created_at, expires_at, superseded_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      fact.id,
      fact.shopifyCustomerId,
      fact.slot,
      fact.value,
      fact.valueRaw ?? null,
      fact.confidence,
      fact.sourceSessionId ?? null,
      fact.sourceMessageId ?? null,
      fact.sourceKind,
      fact.createdAt,
      fact.expiresAt ?? null,
      fact.supersededBy ?? null,
    )
    .run();
  const changes = Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0);
  return changes > 0;
}

export async function insertMemoryFacts(db: D1Database, facts: MemoryFact[]): Promise<number> {
  if (!facts.length) return 0;
  let inserted = 0;
  for (const fact of facts) {
    if (await insertMemoryFact(db, fact)) inserted += 1;
  }
  return inserted;
}

export async function listActiveMemoryFacts(
  db: D1Database,
  shopifyCustomerId: string,
  options?: { limit?: number; now?: number },
): Promise<MemoryFact[]> {
  const now = options?.now ?? Date.now();
  const limit = Math.max(1, Math.min(200, options?.limit ?? 60));
  const rows = await db
    .prepare(
      `SELECT id, shopify_customer_id, slot, value, value_raw, confidence,
              source_session_id, source_message_id, source_kind,
              created_at, expires_at, superseded_by
       FROM memory_facts
       WHERE shopify_customer_id = ?
         AND superseded_by IS NULL
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(shopifyCustomerId, now, limit)
    .all<D1Row>();
  const items = Array.isArray(rows.results) ? rows.results : [];
  return items.map(rowToMemoryFact);
}

export async function deleteMemoryFactsForCustomer(
  db: D1Database,
  shopifyCustomerId: string,
): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM memory_facts WHERE shopify_customer_id = ?`)
    .bind(shopifyCustomerId)
    .run();
  return Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0);
}

export async function insertMemoryEvent(db: D1Database, event: MemoryEvent): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO memory_events (
         id, shopify_customer_id, kind, ref_id, ref_version, content_hash,
         locale, market, session_id, tool_call_id, called_at, meta_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      event.id,
      event.shopifyCustomerId,
      event.kind,
      event.refId,
      event.refVersion ?? null,
      event.contentHash ?? null,
      event.locale ?? null,
      event.market ?? null,
      event.sessionId ?? null,
      event.toolCallId ?? null,
      event.calledAt,
      event.meta ? JSON.stringify(event.meta) : null,
    )
    .run();
  const changes = Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0);
  return changes > 0;
}

export async function deleteMemoryEventsForCustomer(
  db: D1Database,
  shopifyCustomerId: string,
): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM memory_events WHERE shopify_customer_id = ?`)
    .bind(shopifyCustomerId)
    .run();
  return Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0);
}

export async function insertMemoryRawTurn(db: D1Database, turn: MemoryRawTurn): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO memory_raw_turns (
         id, shopify_customer_id, session_id, message_id, role, text,
         text_masked, created_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      turn.id,
      turn.shopifyCustomerId,
      turn.sessionId,
      turn.messageId ?? null,
      turn.role,
      turn.text,
      turn.textMasked ? 1 : 0,
      turn.createdAt,
      turn.expiresAt,
    )
    .run();
  const changes = Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0);
  return changes > 0;
}

export async function deleteMemoryRawTurnsForCustomer(
  db: D1Database,
  shopifyCustomerId: string,
): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM memory_raw_turns WHERE shopify_customer_id = ?`)
    .bind(shopifyCustomerId)
    .run();
  return Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0);
}

export async function deleteExpiredMemoryRawTurns(db: D1Database, now: number): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM memory_raw_turns WHERE expires_at <= ?`)
    .bind(now)
    .run();
  return Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0);
}

export async function listMemoryEventsForCustomer(
  db: D1Database,
  shopifyCustomerId: string,
  options?: { limit?: number; kind?: MemoryEvent['kind'] },
): Promise<MemoryEvent[]> {
  const limit = Math.max(1, Math.min(100, options?.limit ?? 30));
  const params: unknown[] = [shopifyCustomerId];
  let sql = `SELECT id, shopify_customer_id, kind, ref_id, ref_version, content_hash,
              locale, market, session_id, tool_call_id, called_at, meta_json
       FROM memory_events
       WHERE shopify_customer_id = ?`;
  if (options?.kind) {
    sql += ` AND kind = ?`;
    params.push(options.kind);
  }
  sql += ` ORDER BY called_at DESC LIMIT ?`;
  params.push(limit);

  const rows = await db.prepare(sql).bind(...params).all<D1Row>();
  const items = Array.isArray(rows.results) ? rows.results : [];
  return items.map((row) => ({
    id: String(row.id ?? ''),
    shopifyCustomerId: String(row.shopify_customer_id ?? ''),
    kind: (row.kind as MemoryEvent['kind']) ?? 'policy_touch',
    refId: String(row.ref_id ?? ''),
    refVersion: (row.ref_version as string | null) ?? null,
    contentHash: (row.content_hash as string | null) ?? null,
    locale: (row.locale as string | null) ?? null,
    market: (row.market as string | null) ?? null,
    sessionId: (row.session_id as string | null) ?? null,
    toolCallId: (row.tool_call_id as string | null) ?? null,
    calledAt: Number(row.called_at ?? 0),
    meta: typeof row.meta_json === 'string' ? safeJsonParse(row.meta_json as string) : null,
  }));
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
