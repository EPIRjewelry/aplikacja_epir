import type {GemmaIntent} from '../../../src/gemma/intent/schema';
import type {GemmaSlots} from '../../../src/gemma/state/types';

/** Sloty spełniające NEED_PROFILE_MIN + immediate catalog (testy E2E katalogu). */
export const FICTIONAL_CATALOG_READY_SLOTS: GemmaSlots = {
  product_type: 'kolczyki',
  metal: 'srebro',
};

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
