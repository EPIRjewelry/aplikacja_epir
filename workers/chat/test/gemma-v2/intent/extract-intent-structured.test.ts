/**
 * E5b gemma A calls — mutacje M-B5, M-B9
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {extractGemmaIntent} from '../../../src/gemma/intent/extract-intent';
import {GEMMA_INTENT_TIMEOUT_MS} from '../../../src/gemma/intent/constants';
import {GEMMA_INTENT_RESPONSE_FORMAT} from '../../../src/gemma/intent/intent-json-schema';
import {fictionalGemmaIntentJson} from '../fixtures/gemma-intent';

describe('E5b extractGemmaIntent structured', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-GEMMA-SO-A: passes responseFormat, timeoutMs, no max_tokens', async () => {
    const ai = await import('../../../src/ai-client');
    const spy = vi.spyOn(ai, 'getGroqResponse').mockResolvedValue(
      fictionalGemmaIntentJson({state: 'powitanie'}),
    );
    await extractGemmaIntent({env: {} as never, userText: 'fikcyjne', history: []});
    expect(spy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.anything(),
      expect.objectContaining({
        timingLabel: 'buyer_gemma_intent',
        responseFormat: GEMMA_INTENT_RESPONSE_FORMAT,
        timeoutMs: GEMMA_INTENT_TIMEOUT_MS,
      }),
    );
    const opts = spy.mock.calls[0]![2];
    expect(opts?.max_tokens).toBeUndefined();
    expect(opts?.responseFormat?.json_schema.name).toBe('gemma_intent');
    expect(opts?.responseFormat?.json_schema.strict).toBe(true);
  });
});
