import {vi} from 'vitest';
import type {GemmaIntent} from '../../../src/gemma/intent/schema';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';

export async function stubGemmaGroqCalls(options: {
  intent?: Partial<GemmaIntent>;
  formulation?: {text: string; product_refs?: string[]};
  onFormulation?: (messages: unknown) => void;
}) {
  const intentPayload = JSON.stringify(fictionalGemmaIntent(options.intent ?? {}));
  const formulationPayload = JSON.stringify({
    text: options.formulation?.text ?? 'Proszę Pana/Panią — propozycje w załączeniu.',
    product_refs: options.formulation?.product_refs ?? [],
  });
  const ai = await import('../../../src/ai-client');
  return vi.spyOn(ai, 'getGroqResponse').mockImplementation(async (messages, _env, opts) => {
    if (opts?.timingLabel === 'buyer_gemma_intent') return intentPayload;
    if (opts?.timingLabel === 'buyer_gemma_formulation') {
      options.onFormulation?.(messages);
      return formulationPayload;
    }
    return intentPayload;
  });
}
