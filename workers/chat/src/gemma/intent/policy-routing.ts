import {detectPolicyInformationIntent} from '../../intent/policy-information';
import type {GemmaIntent} from './schema';

/**
 * Gdy parser intencji nie ustawi policy_query, a wiadomość klienta wygląda na pytanie
 * o politykę / kontakt / wizytę — uzupełnij policy_query pełnym tekstem klienta (NL),
 * żeby maszyna stanów i KB miały ten sam kontrakt co luxury-system-prompt.
 */
export function applyContactPolicyRouting(intent: GemmaIntent, userText: string): GemmaIntent {
  const trimmedUser = userText.trim();
  if (!trimmedUser) return intent;
  if (intent.policy_query?.trim()) return intent;

  const contactByState = intent.state === 'polityki_kontakt';
  const contactByHeuristic = detectPolicyInformationIntent(trimmedUser).match;
  if (!contactByState && !contactByHeuristic) return intent;

  return {
    ...intent,
    state: 'polityki_kontakt',
    policy_query: trimmedUser,
  };
}
