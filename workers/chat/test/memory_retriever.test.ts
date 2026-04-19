import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/memory/repo', () => ({
  listActiveMemoryFacts: vi.fn(),
  listMemoryFactsByIds: vi.fn(),
  listMemoryRawTurnsByIds: vi.fn(),
}));

vi.mock('../src/memory/vectorize', () => ({
  embedMemoryText: vi.fn(),
  queryMemoryVectors: vi.fn(),
}));

vi.mock('../src/memory/metrics', () => ({
  emitMemoryMetric: vi.fn(),
}));

import { retrieveCustomerMemory } from '../src/memory/retriever';
import { listActiveMemoryFacts, listMemoryFactsByIds, listMemoryRawTurnsByIds } from '../src/memory/repo';
import { embedMemoryText, queryMemoryVectors } from '../src/memory/vectorize';

describe('retrieveCustomerMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates vector matches into useful fact and turn snippets', async () => {
    vi.mocked(listActiveMemoryFacts).mockResolvedValue([
      {
        id: 'fact-1',
        shopifyCustomerId: 'cust-1',
        slot: 'metal',
        value: 'srebro',
        valueRaw: null,
        confidence: 0.91,
        sourceSessionId: 'session-1',
        sourceMessageId: 'msg-1',
        sourceKind: 'extractor',
        createdAt: Date.now(),
        expiresAt: null,
        supersededBy: null,
      },
    ]);
    vi.mocked(listMemoryFactsByIds).mockResolvedValue([]);
    vi.mocked(listMemoryRawTurnsByIds).mockResolvedValue([
      {
        id: 'turn-1',
        shopifyCustomerId: 'cust-1',
        sessionId: 'session-1',
        messageId: 'msg-turn-1',
        role: 'user',
        text: 'Szukam srebrnego pierścionka z opalem i organicznym motywem.',
        textMasked: false,
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000,
      },
    ]);
    vi.mocked(embedMemoryText).mockResolvedValue({
      vector: [0.1, 0.2, 0.3],
      model: 'test-model',
      latencyMs: 12,
      masked: false,
    });
    vi.mocked(queryMemoryVectors)
      .mockResolvedValueOnce([
        {
          id: 'vec-fact-1',
          score: 0.97,
          metadata: { factId: 'fact-1', slot: 'metal' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'vec-turn-1',
          score: 0.88,
          metadata: { turnId: 'turn-1' },
        },
      ]);

    const result = await retrieveCustomerMemory(
      {
        MEMORY_V2_ENABLED: 'true',
        DB_CHATBOT: {} as D1Database,
        MEMORY_INDEX: {} as Env['MEMORY_INDEX'],
        AI: { run: vi.fn() } as Env['AI'],
      } as Env,
      {
        shopifyCustomerId: 'cust-1',
        queryText: 'szukam srebrnego pierścionka',
        includeTurns: true,
      },
    );

    expect(result.factsBlock).toContain('[metal] srebro');
    expect(result.factsBlock).not.toContain('id=');
    expect(result.turnsBlock).toContain('Klient wcześniej napisał');
    expect(result.turnsBlock).toContain('Szukam srebrnego pierścionka z opalem');
  });
});