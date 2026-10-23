import {detectPolicyInformationIntent} from '../../intent/policy-information';
import type {GemmaIntent} from './schema';

/**
 * Gdy model A nie ustawi policy_query, a heurystyka legacy wykrywa politykę/kontakt/FAQ —
 * wymuś ścieżkę KB bez hardcodowania faktów (query = treść klienta).
 */
export function coerceGemmaPolicyIntentFromHeuristic(
  intent: GemmaIntent,
  userText: string,
): GemmaIntent {
  const trimmed = userText.trim();
  if (!trimmed) return intent;
  if (intent.policy_query?.trim()) return intent;
  if (intent.safety !== 'ok') return intent;
  if (intent.cart_action || intent.product_ref?.trim()) return intent;
  if (!detectPolicyInformationIntent(trimmed).match) return intent;

  return {
    ...intent,
    state: 'polityki_kontakt',
    policy_query: trimmed,
  };
}
