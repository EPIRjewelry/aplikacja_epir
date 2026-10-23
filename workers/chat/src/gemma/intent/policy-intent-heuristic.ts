import {detectPolicyInformationIntent} from '../../intent/policy-information';
import type {GemmaIntent} from './schema';

/**
 * Gdy model A nie ustawi policy_query, a heurystyka legacy wykrywa politykę/kontakt/FAQ —
 * wymuś ścieżkę KB bez hardcodowania faktów (query = treść klienta).
 */
/** Wymiana kamienia / zamówienie tego samego wzoru — FAQ sklepu, nie push katalogu. */
export function detectCustomStoneOrOrderKbIntent(userMessage: string): boolean {
  if (typeof userMessage !== 'string') return false;
  const norm = userMessage.trim();
  if (!norm) return false;
  const patterns = [
    /\binnym\s+kamien/i,
    /\binny\s+kamie[nń]/i,
    /\bzamiast\s+/i,
    /\bwymian\w*\s+kamien/i,
    /\bten\s+sam\s+wz[oó]r/i,
    /\bjak\s+zam[oó]wi[cć]/i,
    /\bjak\s+złożyć\s+zamówienie/i,
    /\bzam[oó]wi[cć]\s+.*\b(model|wz[oó]r)\b/i,
    /\b(szafir|ametyst|rubin|turmalin|diament)\b.*\b(albo|lub)\b.*\b(szafir|ametyst|rubin|turmalin|diament)\b/i,
    /\b(albo|lub)\s+(szafir|ametyst|rubin|turmalin)\b/i,
    /\bkamie[nń].*\b(zamiast|innym)\b/i,
  ];
  return patterns.some((re) => re.test(norm));
}

export function coerceGemmaCustomStoneKbIntent(
  intent: GemmaIntent,
  userText: string,
): GemmaIntent {
  const trimmed = userText.trim();
  if (!trimmed) return intent;
  if (intent.policy_query?.trim()) return intent;
  if (intent.safety !== 'ok') return intent;
  if (intent.cart_action || intent.product_ref?.trim()) return intent;
  if (!detectCustomStoneOrOrderKbIntent(trimmed)) return intent;

  return {
    ...intent,
    state: 'polityki_kontakt',
    policy_query: trimmed,
  };
}

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
