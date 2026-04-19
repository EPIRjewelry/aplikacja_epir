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
import { listActiveMemoryFacts, listMemoryFactsByIds, listMemoryRawTurnsByIds } from './repo';
import { buildDeterministicSummary } from './summary-builder';
import type { MemoryFact, MemoryRawTurn } from './types';
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

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)));
}

function shortenText(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxChars) return compact;
  return compact.slice(0, maxChars - 1) + '…';
}

function describeFact(fact: MemoryFact): string {
  const value = shortenText(fact.valueRaw ?? fact.value, 140);
  return `- [${fact.slot}] ${value}`;
}

function describeTurn(turn: MemoryRawTurn): string {
  return `- Klient wcześniej napisał: „${shortenText(turn.text, 160)}”`;
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

  const activeFactsById = new Map(activeFacts.map((fact) => [fact.id, fact]));

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
          const factIds = uniqueIds(factMatches.map((m) => (typeof m.metadata?.factId === 'string' ? m.metadata.factId : '')));
          const missingFactIds = factIds.filter((id) => !activeFactsById.has(id));
          if (missingFactIds.length) {
            const hydratedFacts = await listMemoryFactsByIds(env.DB_CHATBOT, input.shopifyCustomerId, missingFactIds);
            hydratedFacts.forEach((fact) => {
              activeFactsById.set(fact.id, fact);
            });
          }

          const lines = factMatches
            .map((match) => {
              const factId = typeof match.metadata?.factId === 'string' ? match.metadata.factId : '';
              const hydrated = factId ? activeFactsById.get(factId) : undefined;
              if (hydrated) return describeFact(hydrated);
              const slot = typeof match.metadata?.slot === 'string' ? match.metadata.slot : 'fact';
              return `- [${slot}] dopasowana preferencja klienta z wcześniejszej wizyty`;
            })
            .filter((line, index, array) => array.indexOf(line) === index)
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
            const turnIds = uniqueIds(turnMatches.map((m) => (typeof m.metadata?.turnId === 'string' ? m.metadata.turnId : '')));
            const hydratedTurns = await listMemoryRawTurnsByIds(env.DB_CHATBOT, input.shopifyCustomerId, turnIds);
            const turnsById = new Map(hydratedTurns.map((turn) => [turn.id, turn]));
            const lines = turnMatches
              .map((match) => {
                const turnId = typeof match.metadata?.turnId === 'string' ? match.metadata.turnId : '';
                const hydrated = turnId ? turnsById.get(turnId) : undefined;
                return hydrated ? describeTurn(hydrated) : null;
              })
              .filter((line): line is string => Boolean(line))
              .filter((line, index, array) => array.indexOf(line) === index)
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
