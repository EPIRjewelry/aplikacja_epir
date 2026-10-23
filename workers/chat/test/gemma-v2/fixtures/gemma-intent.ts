import type {GemmaIntent} from '../../../src/gemma/intent/schema';

export function fictionalGemmaIntent(overrides: Partial<GemmaIntent> = {}): GemmaIntent {
  return {
    state: 'powitanie',
    slots: {},
    product_ref: null,
    variant_choice: null,
    cart_action: null,
    cart_consent: null,
    policy_query: null,
    safety: 'ok',
    ...overrides,
  };
}

export function fictionalGemmaIntentJson(overrides: Partial<GemmaIntent> = {}): string {
  return JSON.stringify(fictionalGemmaIntent(overrides));
}
