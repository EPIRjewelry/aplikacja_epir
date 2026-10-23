/**
 * E5b intent JSON schema — mutacja M-B8
 */
import {describe, expect, it} from 'vitest';
import {GEMMA_INTENT_JSON_SCHEMA, GEMMA_INTENT_RESPONSE_FORMAT} from '../../src/gemma/intent/intent-json-schema';
import {GEMMA_CONVERSATION_STATE_VALUES, validateGemmaIntent} from '../../src/gemma/intent/schema';

function assertStrictObjectSchema(node: Record<string, unknown>, path = 'root') {
  expect(node.additionalProperties).toBe(false);
  const props = node.properties as Record<string, unknown>;
  const required = node.required as string[];
  expect([...required].sort()).toEqual(Object.keys(props).sort());
  for (const [key, val] of Object.entries(props)) {
    const child = val as Record<string, unknown>;
    if (child.type === 'object' && child.properties) {
      assertStrictObjectSchema(child, `${path}.${key}`);
    }
  }
}

describe('E5b gemma intent schema', () => {
  it('T-GEMMA-SCHEMA-1: strict schema shape and state enum', () => {
    assertStrictObjectSchema(GEMMA_INTENT_JSON_SCHEMA);
    const state = (GEMMA_INTENT_JSON_SCHEMA.properties as Record<string, unknown>).state as {
      enum: string[];
    };
    expect(state.enum).toEqual([...GEMMA_CONVERSATION_STATE_VALUES]);
    expect(GEMMA_INTENT_RESPONSE_FORMAT.json_schema.name).toBe('gemma_intent');
    expect(GEMMA_INTENT_RESPONSE_FORMAT.json_schema.strict).toBe(true);
  });

  it('T-GEMMA-SCHEMA-1b: sample intent passes validateGemmaIntent', () => {
    const sample = {
      state: 'powitanie',
      slots: {
        budget: null,
        metal: null,
        stone: null,
        product_type: null,
        occasion: null,
        recipient: null,
      },
      product_ref: null,
      variant_choice: null,
      cart_action: null,
      cart_consent: null,
      policy_query: null,
      safety: 'ok',
    };
    const out = validateGemmaIntent(sample);
    expect('kind' in out).toBe(false);
  });

  it('T-GEMMA-SCHEMA-1c (Cień): typy pól zgodne z validateGemmaIntent (nullowalność, enumy)', () => {
    const props = GEMMA_INTENT_JSON_SCHEMA.properties as Record<string, Record<string, unknown>>;
    const slots = (props.slots.properties ?? {}) as Record<string, Record<string, unknown>>;
    expect(slots.budget).toEqual({
      anyOf: [{type: 'number'}, {type: 'string'}, {type: 'null'}],
    });
    for (const key of ['metal', 'stone', 'product_type', 'occasion', 'recipient']) {
      expect(slots[key]).toEqual({type: ['string', 'null']});
    }
    for (const key of ['product_ref', 'variant_choice', 'policy_query']) {
      expect(props[key]).toEqual({type: ['string', 'null']});
    }
    expect(props.cart_consent).toEqual({type: ['boolean', 'null']});
    expect(props.cart_action).toEqual({
      anyOf: [{type: 'string', enum: ['add', 'change', 'remove', 'show']}, {type: 'null'}],
    });
    expect(props.safety).toEqual({type: 'string', enum: ['ok', 'refuse']});
    // Każda wartość dopuszczona przez schemat przechodzi walidator (i odwrotnie dla enumów).
    const base = {
      state: 'koszyk',
      slots: {budget: null, metal: null, stone: null, product_type: null, occasion: null, recipient: null},
      product_ref: null,
      variant_choice: null,
      cart_action: null,
      cart_consent: null,
      policy_query: null,
      safety: 'ok',
    };
    for (const a of ['add', 'change', 'remove', 'show', null]) {
      expect('kind' in validateGemmaIntent({...base, cart_action: a})).toBe(false);
    }
    for (const sft of ['ok', 'refuse']) {
      expect('kind' in validateGemmaIntent({...base, safety: sft})).toBe(false);
    }
    for (const c of [true, false, null]) {
      expect('kind' in validateGemmaIntent({...base, cart_consent: c})).toBe(false);
    }
    expect(
      'kind' in
        validateGemmaIntent({
          ...base,
          slots: {...base.slots, budget: 5000},
        }),
    ).toBe(false);
  });

  it('T-GEMMA-SCHEMA-1d (Cień): tylko słowa kluczowe z dokumentacji Groq strict', () => {
    const allowed = new Set(['type', 'properties', 'required', 'additionalProperties', 'enum', 'anyOf', 'items']);
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        expect(allowed.has(k)).toBe(true);
        if (k === 'properties') Object.values(v as object).forEach(walk);
        else if (k === 'anyOf' || k === 'items') walk(v);
      }
    };
    walk(GEMMA_INTENT_JSON_SCHEMA);
  });
});
