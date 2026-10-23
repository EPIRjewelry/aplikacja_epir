import {describe, expect, it} from 'vitest';
import {applyContactPolicyRouting} from '../../../src/gemma/intent/policy-routing';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';
import {transitionGemmaState} from '../../../src/gemma/state/machine';
import {DEFAULT_GEMMA_SESSION_STATE} from '../../../src/gemma/state/types';

describe('applyContactPolicyRouting', () => {
  it('ustawia policy_query z userText dla pytania o telefon', () => {
    const userText = 'jaki jest telefon do pracowni?';
    const out = applyContactPolicyRouting(
      fictionalGemmaIntent({policy_query: null, state: 'propozycje'}),
      userText,
    );
    expect(out.state).toBe('polityki_kontakt');
    expect(out.policy_query).toBe(userText);
  });

  it('ustawia policy_query dla wizyty / na żywo', () => {
    const userText = 'mogę obejrzeć pierścionek na żywo?';
    const out = applyContactPolicyRouting(
      fictionalGemmaIntent({policy_query: null}),
      userText,
    );
    expect(out.policy_query).toBe(userText);
    expect(out.state).toBe('polityki_kontakt');
  });

  it('nie nadpisuje istniejącego policy_query', () => {
    const out = applyContactPolicyRouting(
      fictionalGemmaIntent({policy_query: 'wysyłka za granicę'}),
      'telefon?',
    );
    expect(out.policy_query).toBe('wysyłka za granicę');
  });

  it('routing maszyny: state polityki_kontakt bez policy_query → kb_policies', () => {
    const t = transitionGemmaState(
      DEFAULT_GEMMA_SESSION_STATE,
      fictionalGemmaIntent({state: 'polityki_kontakt', policy_query: null}),
    );
    expect(t.nextState).toBe('polityki_kontakt');
    expect(t.allowedActions).toEqual(['kb_policies']);
  });
});
