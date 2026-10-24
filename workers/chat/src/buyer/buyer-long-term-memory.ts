import type {Env} from '../config/bindings';
import {loadPersonMemory} from '../person-memory';

/** `true`/`false` z klienta; brak pola = unknown. */
export function extractPreferencesConsentFromBody(body: unknown): 0 | 1 | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const raw = (body as {preferences_consent?: unknown}).preferences_consent;
  if (raw === true) return 1;
  if (raw === false) return 0;
  return undefined;
}

/** Fail-closed: brak pola lub jawne `false` → 0. */
export function resolvePreferencesConsentFromBody(body: unknown): 0 | 1 {
  return extractPreferencesConsentFromBody(body) === 1 ? 1 : 0;
}

export function isBuyerLongTermMemoryAllowed(preferencesConsent: 0 | 1 | undefined): boolean {
  return preferencesConsent === 1;
}

/**
 * Pamięć długoterminowa wyłącznie na ścieżce buyer (handleBuyerTurn / gemma).
 * Operator `streamAssistantResponse` — bez zmian.
 */
export async function loadBuyerCrossSessionMemorySummary(
  env: Env,
  shopifyCustomerId: string | null | undefined,
  preferencesConsent: 0 | 1 | undefined,
): Promise<string | null> {
  if (!isBuyerLongTermMemoryAllowed(preferencesConsent)) return null;
  const id = shopifyCustomerId?.trim();
  if (!id || !env.DB_CHATBOT) return null;
  try {
    return await loadPersonMemory(env.DB_CHATBOT, id);
  } catch (e) {
    console.warn('[buyer.long_term_memory] load failed:', e);
    return null;
  }
}
