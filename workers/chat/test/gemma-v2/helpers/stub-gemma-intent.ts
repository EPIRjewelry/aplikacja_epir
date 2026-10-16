import {vi} from 'vitest';
import type {GemmaIntent} from '../../../src/gemma/intent/schema';
import {fictionalGemmaIntentJson} from '../fixtures/gemma-intent';

export async function stubGemmaIntentJson(overrides: Partial<GemmaIntent> = {}) {
  const ai = await import('../../../src/ai-client');
  const payload = fictionalGemmaIntentJson(overrides);
  vi.spyOn(ai, 'getGroqResponse').mockImplementation(async (_messages, _env, options) => {
    if (options?.timingLabel === 'buyer_gemma_intent') {
      return payload;
    }
    return payload;
  });
}
