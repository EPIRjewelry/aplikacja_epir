/**
 * Adapter Vectorize dla indeksu `memory_customer`.
 *
 * Każdy wpis zawiera metadane `{ customerId, kind: 'fact'|'turn', factId?, turnId?, slot?, createdAt }`.
 * Retrieval ZAWSZE z filtrem `customerId` — izolacja per-klient.
 *
 * KB-clamp: do tego indeksu nigdy nie trafia tekst wygenerowany przez asystenta
 * po tool-callu policy, ani raw treść `search_shop_policies_and_faqs`.
 * Filtrowanie jest egzekwowane w consumerze, przed embedingiem.
 */

import type { Env } from '../config/bindings';
import { maskPII } from './kb-guard';

export const MEMORY_EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5';

export type MemoryVectorMetadata = {
  customerId: string;
  kind: 'fact' | 'turn';
  factId?: string;
  turnId?: string;
  slot?: string;
  createdAt: number;
};

export type MemoryVectorMatch = {
  id: string;
  score: number;
  metadata?: Partial<MemoryVectorMetadata> & Record<string, unknown>;
};

export type MemoryEmbedResult = {
  vector: number[];
  model: string;
  latencyMs: number;
};

function hasAiBinding(env: Env): env is Env & { AI: NonNullable<Env['AI']> } {
  return !!env.AI?.run;
}

function hasMemoryIndex(env: Env): env is Env & { MEMORY_INDEX: NonNullable<Env['MEMORY_INDEX']> } {
  return !!env.MEMORY_INDEX;
}

/**
 * Generuje embedding dla tekstu (z opcjonalnym PII-mask). Zwraca null przy awarii.
 */
export async function embedMemoryText(
  env: Env,
  text: string,
  options?: { maskPII?: boolean; timeoutMs?: number },
): Promise<(MemoryEmbedResult & { masked: boolean }) | null> {
  if (!hasAiBinding(env)) return null;
  const startTime = Date.now();
  const shouldMask = options?.maskPII !== false;
  const masked = shouldMask ? maskPII(text) : { masked: text, changed: false };
  const input = masked.masked.trim().slice(0, 4000);
  if (!input) return null;
  const timeoutMs = Math.max(500, options?.timeoutMs ?? 4000);

  try {
    const run = env.AI.run as (model: string, input: unknown) => Promise<unknown>;
    const raw = (await Promise.race([
      run(MEMORY_EMBEDDING_MODEL, { text: [input] }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('embed_timeout')), timeoutMs)),
    ])) as { data?: number[][] } | null;
    const vec = Array.isArray(raw?.data) && Array.isArray(raw?.data[0]) ? (raw!.data[0] as number[]) : null;
    if (!vec || vec.length === 0) {
      console.warn('[memory.vectorize] embed returned empty', {
        model: MEMORY_EMBEDDING_MODEL,
        elapsed_ms: Date.now() - startTime,
      });
      return null;
    }
    return { vector: vec, model: MEMORY_EMBEDDING_MODEL, latencyMs: Date.now() - startTime, masked: masked.changed };
  } catch (err) {
    console.warn('[memory.vectorize] embed failed', {
      model: MEMORY_EMBEDDING_MODEL,
      error: (err as Error).message,
      elapsed_ms: Date.now() - startTime,
    });
    return null;
  }
}

export async function upsertMemoryVectors(
  env: Env,
  rows: Array<{ id: string; values: number[]; metadata: MemoryVectorMetadata }>,
): Promise<boolean> {
  if (!hasMemoryIndex(env) || rows.length === 0) return false;
  const index = env.MEMORY_INDEX as { upsert?: (rows: unknown[]) => Promise<unknown> };
  if (!index.upsert) return false;
  try {
    await index.upsert(
      rows.map((r) => ({
        id: r.id,
        values: r.values,
        metadata: r.metadata,
      })),
    );
    return true;
  } catch (err) {
    console.warn('[memory.vectorize] upsert failed', { error: (err as Error).message });
    return false;
  }
}

/**
 * Query Vectorize w namespace klienta (filter metadata).
 * Gdy binding nieobecny — zwraca [], nie rzuca.
 */
export async function queryMemoryVectors(
  env: Env,
  customerId: string,
  queryVector: number[],
  options?: { topK?: number; kind?: 'fact' | 'turn' },
): Promise<MemoryVectorMatch[]> {
  if (!hasMemoryIndex(env)) return [];
  const index = env.MEMORY_INDEX as {
    query?: (
      v: number[],
      o: { topK: number; filter?: Record<string, unknown>; returnMetadata?: boolean | string },
    ) => Promise<unknown>;
  };
  if (!index.query) return [];
  const topK = Math.max(1, Math.min(20, options?.topK ?? 6));
  const filter: Record<string, unknown> = { customerId };
  if (options?.kind) filter.kind = options.kind;
  try {
    const raw = (await index.query(queryVector, { topK, filter, returnMetadata: 'all' })) as
      | { matches?: MemoryVectorMatch[] }
      | null;
    return Array.isArray(raw?.matches) ? raw!.matches : [];
  } catch (err) {
    console.warn('[memory.vectorize] query failed', { error: (err as Error).message });
    return [];
  }
}

export async function deleteMemoryVectorsByIds(env: Env, ids: string[]): Promise<boolean> {
  if (!hasMemoryIndex(env) || ids.length === 0) return false;
  const index = env.MEMORY_INDEX as { deleteByIds?: (ids: string[]) => Promise<unknown> };
  if (!index.deleteByIds) return false;
  try {
    await index.deleteByIds(ids);
    return true;
  } catch (err) {
    console.warn('[memory.vectorize] delete failed', { error: (err as Error).message });
    return false;
  }
}
