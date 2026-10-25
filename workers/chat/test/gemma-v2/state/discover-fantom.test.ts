import {describe, expect, it} from 'vitest';
import {transitionGemmaState} from '../../../src/gemma/state/machine';
import {DEFAULT_GEMMA_SESSION_STATE} from '../../../src/gemma/state/types';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';

describe('discover przed katalogiem (plan Cień)', () => {
  it('prezent + nie wiem: tura 1 → potrzeby bez katalogu', () => {
    const out = transitionGemmaState(
      {...DEFAULT_GEMMA_SESSION_STATE, state: 'powitanie', turn: 1},
      fictionalGemmaIntent({
        slots: {occasion: 'gift'},
      }),
    );
    expect(out.nextState).toBe('potrzeby');
    expect(out.allowedActions).not.toContain('search_catalog');
  });

  it('prezent: tura 2 w potrzeby + nie wiem → kolejne potrzeby, nie katalog', () => {
    const out = transitionGemmaState(
      {...DEFAULT_GEMMA_SESSION_STATE, state: 'potrzeby', turn: 2, discover_turns: 1},
      fictionalGemmaIntent({slots: {occasion: 'gift'}}),
      {userText: 'no nie wiem'},
    );
    expect(out.nextState).toBe('potrzeby');
    expect(out.allowedActions).not.toContain('search_catalog');
  });

  it('po 2 slotach profilu i discover_turns≥2 → propozycje', () => {
    const out = transitionGemmaState(
      {
        ...DEFAULT_GEMMA_SESSION_STATE,
        state: 'potrzeby',
        turn: 3,
        discover_turns: 2,
        slots: {occasion: 'gift', product_type: 'naszyjnik'},
      },
      fictionalGemmaIntent({
        slots: {occasion: 'gift', product_type: 'naszyjnik', budget: 'do 2000 zł'},
      }),
    );
    expect(out.nextState).toBe('propozycje');
    expect(out.allowedActions).toContain('search_catalog');
  });

  it('naszyjnik srebrny → od razu propozycje (S-B regresja)', () => {
    const out = transitionGemmaState(
      DEFAULT_GEMMA_SESSION_STATE,
      fictionalGemmaIntent({
        slots: {product_type: 'naszyjnik', metal: 'srebro'},
      }),
    );
    expect(out.nextState).toBe('propozycje');
    expect(out.allowedActions).toContain('search_catalog');
  });

  it('sam odbiorca żona → potrzeby, nie katalog', () => {
    const out = transitionGemmaState(
      DEFAULT_GEMMA_SESSION_STATE,
      fictionalGemmaIntent({slots: {recipient: 'żona'}}),
    );
    expect(out.nextState).toBe('potrzeby');
    expect(out.allowedActions).not.toContain('search_catalog');
  });

  it('zaręczyny bez rozmiaru + policy_query → potrzeby (doradztwo)', () => {
    const out = transitionGemmaState(
      DEFAULT_GEMMA_SESSION_STATE,
      fictionalGemmaIntent({
        slots: {product_type: 'pierścionek zaręczynowy'},
        policy_query: 'pierścionek zaręczynowy, rozmiar nie znam, termin za miesiąc',
      }),
    );
    expect(out.nextState).toBe('potrzeby');
    expect(out.allowedActions).not.toContain('kb_policies');
  });
});
