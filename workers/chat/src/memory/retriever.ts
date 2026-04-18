/**
 * Retriever pamięci klienta dla prompt assembler'a (streamAssistant).
 *
 * Dwie warstwy:
 *  1. Typed facts (D1) — zawsze, tanio, deterministycznie (szablon).
 *  2. Semantic retrieval (Vectorize `memory_customer`) — opcjonalnie (flaga),
 *     filtrowane po `customerId` i `kind`. KB clamp: żadnych polityk.
 *
 * Wyniki są składane w kompaktowy blok tekstowy pod podpięcie do promptu
 * jako `<customer_facts_retrieved>` / `<customer_turns_retrieved>`, z twardym
 * limitem znaków (proxy token-budget'u).
 */

import type { Env } from '../config/bindings';
import { emitMemoryMetric } from './metrics';
import { listActiveMemoryFacts } from './repo';
import { buildDeterministicSummary } from './summary-builder';
import type { MemoryFact } from './types';
import { embedMemoryText, queryMemoryVectors } from './vectorize';

export type RetrieveMemoryInput = {
  shopifyCustomerId: string;
  queryText: string;
  includeTurns?: boolean;
  topKFacts?: number;
  topKTurns?: number;
  maxFactsChars?: number;
  maxTurnsChars?: number;
};

export type RetrieveMemoryOutput = {
  deterministicSummary: string;
  factsBlock: string;
  turnsBlock: string;
  totalChars: number;
  activeFactsCount: number;
};

const DEFAULT_MAX_FACTS_CHARS = 600;
const DEFAULT_MAX_TURNS_CHARS = 400;

function truncateBlock(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + '…';
}

function isMemoryV2Enabled(env: Env): boolean {
  return String(env.MEMORY_V2_ENABLED ?? '').toLowerCase() === 'true';
}

function isRawRetrievalEnabled(env: Env): boolean {
  return String(env.MEMORY_RAW_RETRIEVAL_ENABLED ?? '').toLowerCase() === 'true';
}

/**
 * Główna funkcja retrievalu — zwraca dwa bloki tekstu gotowe do wstrzyknięcia
 * w prompt systemowy. Pusta sygnatura gdy flaga MEMORY_V2_ENABLED=false.
 */
export async function retrieveCustomerMemory(
  env: Env,
  input: RetrieveMemoryInput,
): Promise<RetrieveMemoryOutput> {
  const empty: RetrieveMemoryOutput = {
    deterministicSummary: '',
    factsBlock: '',
    turnsBlock: '',
    totalChars: 0,
    activeFactsCount: 0,
  };
  if (!isMemoryV2Enabled(env)) return empty;
  if (!env.DB_CHATBOT) return empty;

  const startTime = Date.now();
  let activeFacts: MemoryFact[] = [];
  try {
    activeFacts = await listActiveMemoryFacts(env.DB_CHATBOT, input.shopifyCustomerId, { limit: 80 });
  } catch (err) {
    console.warn('[memory.retriever] facts read failed:', (err as Error).message);
    return empty;
  }

  const deterministic = buildDeterministicSummary(activeFacts);

  let factsBlock = '';
  let turnsBlock = '';

  if (env.MEMORY_INDEX && env.AI?.run) {
    const embed = await embedMemoryText(env, input.queryText, { timeoutMs: 2500 });
    if (embed) {
      try {
        const factMatches = await queryMemoryVectors(env, input.shopifyCustomerId, embed.vector, {
          topK: input.topKFacts ?? 6,
          kind: 'fact',
        });
        emitMemoryMetric({
          tag: 'chat.memory',
          phase: 'retrieve',
          latency_ms: Date.now() - startTime,
          topk_hits: factMatches.length,
          customer_id: input.shopifyCustomerId,
          kind: 'fact',
        });
        if (factMatches.length) {
          const lines = factMatches
            .map((m) => {
              const slot = m.metadata?.slot ?? 'fact';
              return `- [${slot}] score=${m.score.toFixed(3)} id=${m.id}`;
            })
            .join('\n');
          factsBlock = truncateBlock(lines, input.maxFactsChars ?? DEFAULT_MAX_FACTS_CHARS);
        }

        if ((input.includeTurns ?? isRawRetrievalEnabled(env)) && env.MEMORY_INDEX) {
          const turnMatches = await queryMemoryVectors(env, input.shopifyCustomerId, embed.vector, {
            topK: input.topKTurns ?? 3,
            kind: 'turn',
          });
          emitMemoryMetric({
            tag: 'chat.memory',
            phase: 'retrieve',
            latency_ms: Date.now() - startTime,
            topk_hits: turnMatches.length,
            customer_id: input.shopifyCustomerId,
            kind: 'turn',
          });
          if (turnMatches.length) {
            const lines = turnMatches
              .map((m) => `- score=${m.score.toFixed(3)} id=${m.id}`)
              .join('\n');
            turnsBlock = truncateBlock(lines, input.maxTurnsChars ?? DEFAULT_MAX_TURNS_CHARS);
          }
        }
      } catch (err) {
        console.warn('[memory.retriever] vectorize query failed:', (err as Error).message);
      }
    }
  }

  const totalChars =
    deterministic.length + factsBlock.length + turnsBlock.length;

  return {
    deterministicSummary: deterministic,
    factsBlock,
    turnsBlock,
    totalChars,
    activeFactsCount: activeFacts.length,
  };
}
