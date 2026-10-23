/**
 * E5b formulation JSON schema
 */
import {describe, expect, it} from 'vitest';
import {
  GEMMA_FORMULATION_JSON_SCHEMA,
  GEMMA_FORMULATION_RESPONSE_FORMAT,
} from '../../src/gemma/formulation/formulation-json-schema';
import {parseFormulationJson} from '../../src/gemma/formulation/parse-formulation';

describe('E5b gemma formulation schema', () => {
  it('T-GEMMA-SCHEMA-2: strict schema for text and product_refs', () => {
    expect(GEMMA_FORMULATION_JSON_SCHEMA.additionalProperties).toBe(false);
    const required = GEMMA_FORMULATION_JSON_SCHEMA.required as string[];
    const props = Object.keys(GEMMA_FORMULATION_JSON_SCHEMA.properties as object);
    expect([...required].sort()).toEqual(props.sort());
    expect(GEMMA_FORMULATION_RESPONSE_FORMAT.json_schema.name).toBe('gemma_formulation');
    expect(GEMMA_FORMULATION_RESPONSE_FORMAT.json_schema.strict).toBe(true);
  });

  it('T-GEMMA-SCHEMA-2b: parser accepts schema-shaped JSON', () => {
    const raw = JSON.stringify({text: 'Proszę Pana/Panią — fikcyjna treść.', product_refs: ['g1']});
    const out = parseFormulationJson(raw);
    expect(out.ok).toBe(true);
  });

  it('T-GEMMA-SCHEMA-2c (Cień): pełny kształt schematu B', () => {
    expect(GEMMA_FORMULATION_JSON_SCHEMA).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['text', 'product_refs'],
      properties: {
        text: {type: 'string'},
        product_refs: {type: 'array', items: {type: 'string'}},
      },
    });
  });
});
