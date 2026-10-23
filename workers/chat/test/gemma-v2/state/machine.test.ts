/**
 * E3 state machine — mutacje:
 * - **M-E3-3** — transition zawsze powitanie → TRANS-2/3 FAIL
 * - **M-E3-4** — usuń walidację safety → TRANS-4 FAIL
 * - **M-E3-7** — usuń regułę potrzeby najwyżej raz → SALES-2 FAIL
 * - **M-E3-8** — wymagaj budżetu liczbowego → SALES-1 FAIL
 * - **M-E3-13** — ignoruj cart_consent → TRANS-5 FAIL
 */
import {describe, expect, it} from 'vitest';
import {
  catalogTextFromSlots,
  intentPolicyQueryShouldUseCatalog,
  slotsSufficientForSearch,
  transitionGemmaState,
} from '../../../src/gemma/state/machine';
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

  it('T-E3-TRANS-3: known recipient → propozycje + search_catalog', () => {
    const out = transitionGemmaState(
      DEFAULT_GEMMA_SESSION_STATE,
      fictionalGemmaIntent({
        slots: {recipient: 'żona'},
      }),
    );
    expect(out.nextState).toBe('propozycje');
    expect(out.allowedActions).toContain('search_catalog');
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
          budget_qualitative: 'skromnie, tanio',
        },
      }),
    );
    expect(out.nextState).toBe('propozycje');
    expect(out.nextState).not.toBe('potrzeby');
  });

  it('T-E3-SALES-2: after potrzeby state, next turn → propozycje', () => {
    const out = transitionGemmaState(
      {...DEFAULT_GEMMA_SESSION_STATE, state: 'potrzeby', turn: 1},
      fictionalGemmaIntent({state: 'potrzeby', slots: {}}),
    );
    expect(out.nextState).toBe('propozycje');
  });

  it('T-E3-SUFF-BUD-1: sam budget=5000 nie wystarcza do search_catalog', () => {
    expect(slotsSufficientForSearch({budget: 5000})).toBe(false);
    const out = transitionGemmaState(
      DEFAULT_GEMMA_SESSION_STATE,
      fictionalGemmaIntent({state: 'propozycje', slots: {budget: 5000}}),
    );
    expect(out.allowedActions).not.toContain('search_catalog');
    expect(out.nextState).toBe('potrzeby');
    expect(out.missingSlot).toBe('metal');
  });

  it('T-E3-SUFF-BUD-2: budget=5000 + metal złoto → search_catalog + text z metalem', () => {
    expect(slotsSufficientForSearch({budget: 5000, metal: 'złoto'})).toBe(true);
    const out = transitionGemmaState(
      DEFAULT_GEMMA_SESSION_STATE,
      fictionalGemmaIntent({
        state: 'propozycje',
        slots: {budget: 5000, metal: 'złoto'},
      }),
    );
    expect(out.allowedActions).toContain('search_catalog');
    expect(catalogTextFromSlots(out.slots)).toMatch(/złoto/i);
  });

  it('T-E3-SUFF-S2: „5 tysięcy” po metalu złoto — metal zostaje, text niepusty', () => {
    const out = transitionGemmaState(
      {
        ...DEFAULT_GEMMA_SESSION_STATE,
        state: 'propozycje',
        slots: {metal: 'złoto', budget: 2500},
      },
      fictionalGemmaIntent({
        state: 'propozycje',
        slots: {budget: 5000},
      }),
    );
    expect(out.slots.metal).toBe('złoto');
    expect(out.slots.budget).toBe(5000);
    expect(out.allowedActions).toContain('search_catalog');
    expect(catalogTextFromSlots(out.slots)).toMatch(/złoto/i);
  });

  it('T-E3-MERGE-BUD-1: intent slots.budget null clears inherited budget', () => {
    const out = transitionGemmaState(
      {
        ...DEFAULT_GEMMA_SESSION_STATE,
        slots: {budget: 3000, metal: '585'},
      },
      fictionalGemmaIntent({
        state: 'propozycje',
        slots: {budget: null},
      }),
    );
    expect(out.slots.budget).toBeUndefined();
    expect(out.slots.metal).toBe('585');
  });

  it('T-E3-POLICY-CAT-1: cena szafiru w 585 → search_catalog not kb', () => {
    const intent = fictionalGemmaIntent({
      policy_query: 'a w 585 ile kosztuje szafir?',
      slots: {budget: null, stone: 'szafir'},
    });
    expect(
      intentPolicyQueryShouldUseCatalog(intent, {
        ...DEFAULT_GEMMA_SESSION_STATE.slots,
        metal: '585',
        budget: 3000,
      }),
    ).toBe(true);
    const out = transitionGemmaState(
      {
        ...DEFAULT_GEMMA_SESSION_STATE,
        slots: {metal: '585', budget: 3000},
      },
      intent,
    );
    expect(out.allowedActions).toContain('search_catalog');
    expect(out.allowedActions).not.toContain('kb_policies');
    expect(out.slots.budget).toBeUndefined();
  });

  it('T-E3-GE-GZ-1: same transition for GE and GZ channel context (machine is channel-agnostic)', () => {
    const intent = fictionalGemmaIntent({slots: {product_type: 'pierścionek'}});
    const ge = transitionGemmaState(DEFAULT_GEMMA_SESSION_STATE, intent);
    const gz = transitionGemmaState(DEFAULT_GEMMA_SESSION_STATE, intent);
    expect(ge).toEqual(gz);
  });
});
