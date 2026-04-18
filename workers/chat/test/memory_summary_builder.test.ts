import { describe, expect, it } from 'vitest';

import { buildDeterministicSummary } from '../src/memory/summary-builder';
import type { MemoryFact } from '../src/memory/types';

function fact(partial: Partial<MemoryFact>): MemoryFact {
  return {
    id: partial.id ?? `fact_${Math.random().toString(36).slice(2, 8)}`,
    shopifyCustomerId: partial.shopifyCustomerId ?? 'gid://shopify/Customer/1',
    slot: partial.slot ?? 'intent',
    value: partial.value ?? 'x',
    valueRaw: partial.valueRaw ?? null,
    confidence: partial.confidence ?? 0.8,
    sourceSessionId: null,
    sourceMessageId: null,
    sourceKind: 'extractor',
    createdAt: partial.createdAt ?? 1_000_000,
    expiresAt: partial.expiresAt ?? null,
    supersededBy: partial.supersededBy ?? null,
  };
}

describe('memory/summary-builder', () => {
  it('zwraca pusty string gdy brak faktów', () => {
    expect(buildDeterministicSummary([])).toBe('');
  });

  it('składa zwięzły akapit z typed facts', () => {
    const facts: MemoryFact[] = [
      fact({ slot: 'budget', value: '2500', confidence: 0.9 }),
      fact({ slot: 'metal', value: 'srebro', confidence: 0.8 }),
      fact({ slot: 'stone', value: 'szafir', confidence: 0.8 }),
      fact({ slot: 'ring_size', value: '14', confidence: 0.85 }),
      fact({ slot: 'style', value: 'klasyczny', confidence: 0.65 }),
    ];
    const summary = buildDeterministicSummary(facts);
    expect(summary).toMatch(/Preferencje zapamiętane:/);
    expect(summary).toContain('2500 zł');
    expect(summary).toContain('srebro');
    expect(summary).toContain('szafir');
    expect(summary).toContain('rozmiar: 14');
    expect(summary).toContain('klasyczny');
    expect(summary.length).toBeLessThanOrEqual(700);
  });

  it('preferuje fakty o wyższej confidence', () => {
    const facts: MemoryFact[] = [
      fact({ slot: 'metal', value: 'złoto', confidence: 0.5, createdAt: 1 }),
      fact({ slot: 'metal', value: 'srebro', confidence: 0.9, createdAt: 2 }),
    ];
    const summary = buildDeterministicSummary(facts);
    const idxSrebro = summary.indexOf('srebro');
    const idxZloto = summary.indexOf('złoto');
    expect(idxSrebro).toBeGreaterThanOrEqual(0);
    expect(idxSrebro).toBeLessThan(idxZloto === -1 ? Infinity : idxZloto);
  });

  it('pomija fakty superseded_by', () => {
    const facts: MemoryFact[] = [
      fact({ slot: 'ring_size', value: '12', supersededBy: 'fact_abc' }),
      fact({ slot: 'ring_size', value: '14' }),
    ];
    const summary = buildDeterministicSummary(facts);
    expect(summary).toContain('rozmiar: 14');
    expect(summary).not.toContain('rozmiar: 12');
  });
});
