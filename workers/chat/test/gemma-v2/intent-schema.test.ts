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
});
