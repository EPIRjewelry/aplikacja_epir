/**
 * Consumer kolejki `memory-extract`.
 *
 * Dla każdej wiadomości:
 *  1. Klasyfikuje fragmenty (raw_user_turn / policy_touch / product_touch / ignore).
 *  2. Ekstrahuje typed facts (regex first-pass + opcjonalny LLM).
 *  3. Zapisuje do D1 (facts/events/raw_turns) — idempotentnie.
 *  4. Emit embeddingi dla facts + (opcjonalnie) user-turns → Vectorize `memory_customer`.
 *  5. Rebuilduje `person_memory.summary` deterministycznie.
 *
 * KB-clamp egzekwowany na poziomie klasyfikatora i przed embedingiem.
 * Błędy rzucane w górę (Cloudflare Queues retryuje max_retries razy przed DLQ).
 */

import type { Env } from '../config/bindings';
import {
  loadPersonMemoryRecord,
  upsertPersonMemoryVersioned,
} from '../person-memory';
import { classifyFragment, turnUsedPolicyTool } from './classifier';
import { extractFactsDeterministic, extractFactsLLM, toMemoryFact } from './extractor';
import type { ExtractedFact } from './extractor';
import {
  deleteMemoryEventsForCustomer,
  deleteMemoryFactsForCustomer,
  deleteMemoryRawTurnsForCustomer,
  insertMemoryEvent,
  insertMemoryFacts,
  insertMemoryRawTurn,
  listActiveMemoryFacts,
} from './repo';
import { maskPII } from './kb-guard';
import { emitMemoryMetric } from './metrics';
import type { MemoryExtractMessage } from './queue-message';
import { isMemoryExtractMessage } from './queue-message';
import { buildDeterministicSummary } from './summary-builder';
import {
  RAW_TURN_TTL_MS,
  type MemoryEvent,
  type MemoryRawTurn,
} from './types';
import { deleteMemoryVectorsByIds, embedMemoryText, upsertMemoryVectors } from './vectorize';

export type MemoryExtractOutcome = {
  ok: true;
  factsNew: number;
  factsDedup: number;
  eventsNew: number;
  rawTurnsIndexed: number;
  vectorsUpserted: number;
  summaryChars: number;
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Główna funkcja consumer'a — wywoływana przez Cloudflare Queues handler
 * albo ręcznie (tryb synchroniczny w DO jako fallback gdy brak queue binding'u).
 */
export async function processMemoryExtractMessage(
  env: Env,
  message: MemoryExtractMessage,
): Promise<MemoryExtractOutcome> {
  const startTime = Date.now();
  if (!env.DB_CHATBOT) {
    throw new Error('memory_extract_missing_db');
  }
  const db = env.DB_CHATBOT;
  const customerId = message.shopifyCustomerId;
  const sessionId = message.sessionId;
  const toolCallsAll = message.turns
    .flatMap((t) => t.toolCalls ?? [])
    .map((tc) => ({ name: tc.name }));
  const policyTool = turnUsedPolicyTool(toolCallsAll);

  const userTexts: string[] = [];
  const rawTurnsToIndex: Array<{ text: string; messageId?: string }> = [];
  const events: MemoryEvent[] = [];

  for (const turn of message.turns) {
    const verdict = classifyFragment(
      {
        role: turn.role,
        content: turn.content ?? '',
        toolName: turn.toolName,
        toolCallId: turn.toolCallId,
        toolCalls: turn.toolCalls,
      },
      { turnUsedPolicyTool: policyTool },
    );
    if (verdict.kind === 'ignore') {
      if (verdict.reason.startsWith('kb_guard_')) {
        emitMemoryMetric({
          tag: 'chat.memory',
          phase: 'kb_guard_blocked',
          reason: verdict.reason,
          role: turn.role,
          customer_id: customerId,
          tool_name: turn.toolName,
        });
      }
      continue;
    }
    if (verdict.kind === 'raw_user_turn') {
      userTexts.push(verdict.text);
      rawTurnsToIndex.push({ text: verdict.text, messageId: turn.messageId });
    } else if (verdict.kind === 'policy_touch') {
      events.push({
        id: newId('evt'),
        shopifyCustomerId: customerId,
        kind: 'policy_touch',
        refId: verdict.refId ?? 'unknown',
        refVersion: verdict.refVersion,
        contentHash: null,
        locale: message.locale ?? null,
        market: message.market ?? null,
        sessionId,
        toolCallId: verdict.toolCallId ?? null,
        calledAt: turn.ts ?? Date.now(),
        meta: { channel: message.channel ?? null, storefrontId: message.storefrontId ?? null },
      });
    } else if (verdict.kind === 'product_touch') {
      events.push({
        id: newId('evt'),
        shopifyCustomerId: customerId,
        kind: 'product_touch',
        refId: verdict.refId ?? 'unknown',
        locale: message.locale ?? null,
        market: message.market ?? null,
        sessionId,
        toolCallId: verdict.toolCallId ?? null,
        calledAt: turn.ts ?? Date.now(),
        meta: null,
      });
    } else if (verdict.kind === 'cart_touch') {
      events.push({
        id: newId('evt'),
        shopifyCustomerId: customerId,
        kind: 'cart_touch',
        refId: verdict.refId ?? 'unknown',
        locale: message.locale ?? null,
        market: message.market ?? null,
        sessionId,
        toolCallId: verdict.toolCallId ?? null,
        calledAt: turn.ts ?? Date.now(),
        meta: null,
      });
    } else {
      // customer_fact_candidate — rzadki, gdyby klasyfikator go wyróżnił; traktuj jak user turn
      userTexts.push(verdict.text);
    }
  }

  const deterministicFacts = extractFactsDeterministic(userTexts);
  let softFacts: ExtractedFact[] = [];
  try {
    softFacts = await extractFactsLLM(env, userTexts, { timeoutMs: 2500 });
  } catch (err) {
    emitMemoryMetric({
      tag: 'chat.memory',
      phase: 'extract_failure',
      error: `llm_extractor: ${(err as Error).message}`,
      customer_id: customerId,
      session_id: sessionId,
    });
  }

  const mergedFacts = [...deterministicFacts, ...softFacts];
  const lastMessageTurn = [...message.turns].reverse().find((t) => t.role === 'user');
  const memoryFacts = mergedFacts.map((f) =>
    toMemoryFact(f, {
      shopifyCustomerId: customerId,
      sourceSessionId: sessionId,
      sourceMessageId: lastMessageTurn?.messageId ?? null,
      sourceKind: 'extractor',
    }),
  );
  const factsNew = await insertMemoryFacts(db, memoryFacts);
  const factsDedup = memoryFacts.length - factsNew;

  let eventsNew = 0;
  for (const evt of events) {
    if (await insertMemoryEvent(db, evt)) eventsNew += 1;
  }

  const now = Date.now();
  let rawTurnsIndexed = 0;
  for (const rawTurn of rawTurnsToIndex) {
    const masked = maskPII(rawTurn.text);
    const row: MemoryRawTurn = {
      id: newId('rt'),
      shopifyCustomerId: customerId,
      sessionId,
      messageId: rawTurn.messageId ?? null,
      role: 'user',
      text: masked.masked,
      textMasked: masked.changed,
      createdAt: now,
      expiresAt: now + RAW_TURN_TTL_MS,
    };
    if (await insertMemoryRawTurn(db, row)) rawTurnsIndexed += 1;
  }

  let vectorsUpserted = 0;
  if (env.MEMORY_INDEX && env.AI?.run) {
    const vectors: Array<{ id: string; values: number[]; metadata: ReturnType<typeof buildMeta> }> = [];
    for (const fact of memoryFacts) {
      const text = `${fact.slot}: ${fact.value}`;
      const embed = await embedMemoryText(env, text, { maskPII: false });
      if (!embed) continue;
      emitMemoryMetric({
        tag: 'chat.memory',
        phase: 'embed',
        latency_ms: embed.latencyMs,
        model: embed.model,
        masked: embed.masked,
        chars: text.length,
      });
      vectors.push({
        id: fact.id,
        values: embed.vector,
        metadata: buildMeta({
          customerId,
          kind: 'fact',
          factId: fact.id,
          slot: fact.slot,
          createdAt: fact.createdAt,
        }),
      });
    }
    for (const rawTurn of rawTurnsToIndex.slice(0, 6)) {
      const embed = await embedMemoryText(env, rawTurn.text);
      if (!embed) continue;
      const id = newId('turn');
      vectors.push({
        id,
        values: embed.vector,
        metadata: buildMeta({ customerId, kind: 'turn', turnId: id, createdAt: Date.now() }),
      });
    }
    if (vectors.length) {
      const ok = await upsertMemoryVectors(env, vectors);
      if (ok) vectorsUpserted = vectors.length;
    }
  }

  const activeFacts = await listActiveMemoryFacts(db, customerId, { limit: 80 });
  const summary = buildDeterministicSummary(activeFacts);
  if (summary) {
    const current = await loadPersonMemoryRecord(db, customerId);
    const requestId = `memory_extract:${message.idempotencyKey}`;
    const writeResult = await upsertPersonMemoryVersioned(db, {
      shopifyCustomerId: customerId,
      summary,
      expectedVersion: current?.version ?? 0,
      requestId,
    });
    emitMemoryMetric({
      tag: 'chat.memory',
      phase: 'summary_build',
      source: 'deterministic',
      chars: summary.length,
      customer_id: customerId,
    });
    if (writeResult.status === 'conflict') {
      console.warn('[memory.consumer] summary version conflict (non-fatal)', {
        customer_id: customerId,
        request_id: requestId,
      });
    }
  }

  const outcome: MemoryExtractOutcome = {
    ok: true,
    factsNew,
    factsDedup,
    eventsNew,
    rawTurnsIndexed,
    vectorsUpserted,
    summaryChars: summary.length,
  };

  emitMemoryMetric({
    tag: 'chat.memory',
    phase: 'extract',
    latency_ms: Date.now() - startTime,
    facts_new: factsNew,
    facts_dedup: factsDedup,
    events_new: eventsNew,
    raw_turns_indexed: rawTurnsIndexed,
    vectors_upserted: vectorsUpserted,
    session_id: sessionId,
    customer_id: customerId,
    reason: message.reason,
  });

  return outcome;
}

function buildMeta(meta: {
  customerId: string;
  kind: 'fact' | 'turn';
  factId?: string;
  turnId?: string;
  slot?: string;
  createdAt: number;
}) {
  return meta;
}

/**
 * Handler batcha z Cloudflare Queues.
 * Nie rzuca na per-wiadomość błąd — każdą osobno `ack`-uje / `retry`-uje.
 */
export async function handleMemoryExtractBatch(
  env: Env,
  batch: MessageBatch<unknown>,
): Promise<void> {
  for (const msg of batch.messages) {
    const body = msg.body;
    if (!isMemoryExtractMessage(body)) {
      console.warn('[memory.consumer] invalid message shape — ack and drop', { id: msg.id });
      msg.ack();
      continue;
    }
    try {
      await processMemoryExtractMessage(env, body);
      msg.ack();
    } catch (err) {
      emitMemoryMetric({
        tag: 'chat.memory',
        phase: 'extract_failure',
        error: (err as Error).message,
        customer_id: body.shopifyCustomerId,
        session_id: body.sessionId,
        retry: msg.attempts ?? undefined,
      });
      msg.retry();
    }
  }
}

/**
 * Kasuje kompletną pamięć klienta (GDPR right-to-erasure).
 * Bez błędów nawet gdy część zasobów niedostępna.
 */
export async function eraseCustomerMemory(
  env: Env,
  shopifyCustomerId: string,
): Promise<{ factsDeleted: number; eventsDeleted: number; rawDeleted: number; vectorsDeleted: boolean }> {
  const db = env.DB_CHATBOT;
  let factsDeleted = 0;
  let eventsDeleted = 0;
  let rawDeleted = 0;
  if (db) {
    try {
      factsDeleted = await deleteMemoryFactsForCustomer(db, shopifyCustomerId);
    } catch (err) {
      console.warn('[memory.erase] facts delete failed', { error: (err as Error).message });
    }
    try {
      eventsDeleted = await deleteMemoryEventsForCustomer(db, shopifyCustomerId);
    } catch (err) {
      console.warn('[memory.erase] events delete failed', { error: (err as Error).message });
    }
    try {
      rawDeleted = await deleteMemoryRawTurnsForCustomer(db, shopifyCustomerId);
    } catch (err) {
      console.warn('[memory.erase] raw turns delete failed', { error: (err as Error).message });
    }
  }

  let vectorsDeleted = false;
  if (env.MEMORY_INDEX) {
    try {
      const index = env.MEMORY_INDEX as {
        query?: (
          v: number[],
          o: { topK: number; filter?: Record<string, unknown>; returnMetadata?: boolean | string },
        ) => Promise<unknown>;
      };
      if (index.query) {
        const dim = 384;
        const zero = new Array<number>(dim).fill(0);
        const raw = (await index.query(zero, {
          topK: 100,
          filter: { customerId: shopifyCustomerId },
          returnMetadata: 'none',
        })) as { matches?: Array<{ id: string }> } | null;
        const ids = Array.isArray(raw?.matches) ? raw!.matches.map((m) => m.id) : [];
        if (ids.length) {
          vectorsDeleted = await deleteMemoryVectorsByIds(env, ids);
        } else {
          vectorsDeleted = true;
        }
      }
    } catch (err) {
      console.warn('[memory.erase] vectors delete failed', { error: (err as Error).message });
    }
  }

  emitMemoryMetric({
    tag: 'chat.memory',
    phase: 'erasure',
    customer_id: shopifyCustomerId,
    facts_deleted: factsDeleted,
    events_deleted: eventsDeleted,
    raw_deleted: rawDeleted,
    vectors_deleted: vectorsDeleted,
  });

  return { factsDeleted, eventsDeleted, rawDeleted, vectorsDeleted };
}
