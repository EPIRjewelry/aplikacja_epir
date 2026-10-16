/**
 * E3 extract intent — mock getGroqResponse, bez live AIG.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {extractGemmaIntent} from '../../../src/gemma/intent/extract-intent';
import {fictionalGemmaIntentJson} from '../fixtures/gemma-intent';

describe('E3 extractGemmaIntent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-E3-INTENT-3: mock getGroqResponse returns parsed intent', async () => {
    const ai = await import('../../../src/ai-client');
    const spy = vi.spyOn(ai, 'getGroqResponse').mockResolvedValue(
      fictionalGemmaIntentJson({
        state: 'propozycje',
        slots: {recipient: 'żona', budget: 'skromnie'},
      }),
    );
    const out = await extractGemmaIntent({
      env: {} as never,
      userText: 'Fikcyjne zapytanie o prezent',
      history: [],
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.intent.slots.recipient).toBe('żona');
    }
    expect(spy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.anything(),
      expect.objectContaining({timingLabel: 'buyer_gemma_intent', max_tokens: 512}),
    );
  });
});
