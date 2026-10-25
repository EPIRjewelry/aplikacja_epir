/**
 * E3 state machine — mutacje:
 * - **M-E3-3** — transition zawsze powitanie → TRANS-2/3 FAIL
 * - **M-E3-4** — usuń walidację safety → TRANS-4 FAIL
 * - **M-E3-7** — usuń regułę potrzeby najwyżej raz → SALES-2 FAIL
 * - **M-E3-8** — wymagaj budżetu liczbowego → SALES-1 FAIL
 * - **M-E3-13** — ignoruj cart_consent → TRANS-5 FAIL
 */
import {describe, expect, it} from 'vitest';
import {transitionGemmaState} from '../../../src/gemma/state/machine';
import {DEFAULT_GEMMA_SESSION_STATE} from '../../../src/gemma/state/types';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';

describe('E3 transitionGemmaState', () => {
  it('T-E3-TRANS-1: powitanie + small talk stays powitanie on first turn', () => {
    const out = transitionGemmaState(
      {...DEFAULT_GEMMA_SESSION_STATE, state: 'powitanie', turn: 0},
      fictionalGemmaIntent({state: 'powitanie'}),
    );
    expect(out.nextState).toBe('powitanie');
  });

  it('T-E3-TRANS-2: missing need → potrzeby with missingSlot', () => {
    const out = transitionGemmaState(
      {...DEFAULT_GEMMA_SESSION_STATE, state: 'powitanie', turn: 1},
      fictionalGemmaIntent({state: 'potrzeby'}),
    );
    expect(out.nextState).toBe('potrzeby');
    expect(out.missingSlot).toBeDefined();
  });

  it('T-E3-TRANS-3: sam odbiorca → potrzeby (discover przed katalogiem)', () => {
    const out = transitionGemmaState(
      DEFAULT_GEMMA_SESSION_STATE,
      fictionalGemmaIntent({
        slots: {recipient: 'żona'},
      }),
    );
    expect(out.nextState).toBe('potrzeby');
    expect(out.allowedActions).not.toContain('search_catalog');
  });

  it('T-E3-TRANS-4: safety refuse → odmowa', () => {
    const out = transitionGemmaState(
      DEFAULT_GEMMA_SESSION_STATE,
      fictionalGemmaIntent({safety: 'refuse'}),
    );
    expect(out.nextState).toBe('odmowa');
  });

  it('T-E3-TRANS-5: cart add without consent → koszyk (no cart mutation in E3)', () => {
    const out = transitionGemmaState(
      DEFAULT_GEMMA_SESSION_STATE,
      fictionalGemmaIntent({
        cart_action: 'add',
        cart_consent: false,
      }),
    );
    expect(out.nextState).toBe('koszyk');
  });

  it('T-E3-SALES-1: prezent dla żony, skromnie, tanio → propozycje not potrzeby', () => {
    const out = transitionGemmaState(
      DEFAULT_GEMMA_SESSION_STATE,
      fictionalGemmaIntent({
        slots: {
          recipient: 'żona',
          occasion: 'prezent',
          budget: 'skromnie, tanio',
        },
      }),
    );
    expect(out.nextState).toBe('propozycje');
    expect(out.nextState).not.toBe('potrzeby');
  });

  it('T-E3-SALES-2: after potrzeby + nie wiem → kolejne potrzeby', () => {
    const out = transitionGemmaState(
      {...DEFAULT_GEMMA_SESSION_STATE, state: 'potrzeby', turn: 1, discover_turns: 1},
      fictionalGemmaIntent({state: 'potrzeby', slots: {}}),
      {userText: 'nie wiem'},
    );
    expect(out.nextState).toBe('potrzeby');
    expect(out.allowedActions).not.toContain('search_catalog');
  });

  it('T-E3-GE-GZ-1: same transition for GE and GZ channel context (machine is channel-agnostic)', () => {
    const intent = fictionalGemmaIntent({slots: {product_type: 'pierścionek'}});
    const ge = transitionGemmaState(DEFAULT_GEMMA_SESSION_STATE, intent);
    const gz = transitionGemmaState(DEFAULT_GEMMA_SESSION_STATE, intent);
    expect(ge).toEqual(gz);
  });
});
