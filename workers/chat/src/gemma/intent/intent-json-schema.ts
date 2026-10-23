import type {GroqJsonSchemaResponseFormat} from '../../ai-client';
import {GEMMA_CONVERSATION_STATE_VALUES} from './schema';

const nullString = {type: ['string', 'null'] as const};

const slotsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['budget', 'metal', 'stone', 'product_type', 'occasion', 'recipient'],
  properties: {
    budget: {anyOf: [{type: 'number'}, {type: 'string'}, {type: 'null'}]},
    metal: nullString,
    stone: nullString,
    product_type: nullString,
    occasion: nullString,
    recipient: nullString,
  },
};

export const GEMMA_INTENT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'state',
    'slots',
    'product_ref',
    'variant_choice',
    'cart_action',
    'cart_consent',
    'policy_query',
    'safety',
  ],
  properties: {
    state: {type: 'string', enum: [...GEMMA_CONVERSATION_STATE_VALUES]},
    slots: slotsSchema,
    product_ref: nullString,
    variant_choice: nullString,
    policy_query: nullString,
    cart_consent: {type: ['boolean', 'null'] as const},
    cart_action: {
      anyOf: [
        {type: 'string', enum: ['add', 'change', 'remove', 'show']},
        {type: 'null'},
      ],
    },
    safety: {type: 'string', enum: ['ok', 'refuse']},
  },
};

export const GEMMA_INTENT_RESPONSE_FORMAT: GroqJsonSchemaResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'gemma_intent',
    strict: true,
    schema: GEMMA_INTENT_JSON_SCHEMA,
  },
};
