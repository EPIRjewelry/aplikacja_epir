import {describe, expect, it} from 'vitest';
import {coerceGemmaPolicyIntentFromHeuristic} from '../../../src/gemma/intent/policy-intent-heuristic';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';

describe('coerceGemmaPolicyIntentFromHeuristic', () => {
  it('ustawia policy_query i polityki_kontakt gdy heurystyka wykryje telefon', () => {
    const userText = 'Jaki jest numer telefonu do pracowni?';
    const intent = fictionalGemmaIntent({policy_query: null, state: 'propozycje'});
    const out = coerceGemmaPolicyIntentFromHeuristic(intent, userText);
    expect(out.state).toBe('polityki_kontakt');
    expect(out.policy_query).toBe(userText);
  });

  it('nie nadpisuje gdy policy_query już ustawione', () => {
    const intent = fictionalGemmaIntent({policy_query: 'wysyłka', state: 'polityki_kontakt'});
    const out = coerceGemmaPolicyIntentFromHeuristic(intent, 'telefon?');
    expect(out.policy_query).toBe('wysyłka');
  });

  it('nie wymusza KB na neutralnym zapytaniu katalogowym', () => {
    const intent = fictionalGemmaIntent({policy_query: null, state: 'propozycje'});
    const out = coerceGemmaPolicyIntentFromHeuristic(
      intent,
      'Pokaż mi złote pierścionki z brylantem',
    );
    expect(out.policy_query).toBeNull();
    expect(out.state).toBe('propozycje');
  });
});
