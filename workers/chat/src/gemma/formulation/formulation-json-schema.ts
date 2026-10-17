import type {GroqJsonSchemaResponseFormat} from '../../ai-client';

export const GEMMA_FORMULATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'product_refs'],
  properties: {
    text: {type: 'string'},
    product_refs: {type: 'array', items: {type: 'string'}},
  },
};

export const GEMMA_FORMULATION_RESPONSE_FORMAT: GroqJsonSchemaResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'gemma_formulation',
    strict: true,
    schema: GEMMA_FORMULATION_JSON_SCHEMA,
  },
};
