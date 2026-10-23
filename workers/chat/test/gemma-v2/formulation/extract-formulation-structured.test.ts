/**
 * E5b gemma B calls — mutacje M-B6, M-B10
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {extractFormulationReply} from '../../../src/gemma/formulation/extract-formulation';
import {GEMMA_FORMULATION_RESPONSE_FORMAT} from '../../../src/gemma/formulation/formulation-json-schema';
import type {TurnFacts} from '../../../src/gemma/formulation/types';

const turn: TurnFacts = {
  channelId: 'epir-online-store',
  state: 'propozycje',
  allowedRefs: ['g1'],
  products: [
    {ref: 'g1', url: '/products/fikcyjny', priceDisplay: '100 zł', title: 'Fikcyjny pierścionek', available: true},
  ],
  kbAnswer: null,
  allowedUrls: ['/products/fikcyjny'],
  allowedNumbers: ['100'],
};

describe('E5b extractFormulationReply structured', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-GEMMA-SO-B: passes gemma_formulation format and positive timeoutMs', async () => {
    const ai = await import('../../../src/ai-client');
    const spy = vi.spyOn(ai, 'getGroqResponse').mockResolvedValue(
      JSON.stringify({text: 'Proszę Pana/Panią — fikcyjna.', product_refs: []}),
    );
    await extractFormulationReply({
      env: {} as never,
      userText: 'fikcyjne',
      turn,
      deadlineMs: Date.now() + 4000,
    });
    expect(spy).toHaveBeenCalled();
    const opts = spy.mock.calls[0]![2];
    expect(opts?.responseFormat).toEqual(GEMMA_FORMULATION_RESPONSE_FORMAT);
    expect(opts?.timeoutMs).toBeGreaterThan(0);
    expect(opts?.timeoutMs).toBeLessThanOrEqual(4000);
    const msgs = spy.mock.calls[0]![0] as {role: string; content: string}[];
    const userMsg = msgs.find((m) => m.role === 'user')?.content ?? '';
    expect(userMsg).not.toContain('form_of_address');
  });

  it('T-GEMMA-TIMER-B: po szybkiej odpowiedzi B nie zostaje żaden timer (clearTimeout)', async () => {
    vi.useFakeTimers();
    try {
      const ai = await import('../../../src/ai-client');
      vi.spyOn(ai, 'getGroqResponse').mockResolvedValue(
        JSON.stringify({text: 'Proszę Pana/Panią — fikcyjna.', product_refs: []}),
      );
      const out = await extractFormulationReply({
        env: {} as never,
        userText: 'fikcyjne',
        turn,
        deadlineMs: Date.now() + 4000,
      });
      expect(out).not.toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
