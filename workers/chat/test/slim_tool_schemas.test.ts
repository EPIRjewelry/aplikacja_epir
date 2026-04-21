import { describe, it, expect } from 'vitest';
import {
  TOOL_SCHEMAS,
  TOOL_SCHEMAS_SLIM,
  resolveToolSchemas,
  shouldUseSlimToolSchemas,
  getToolDefinitions,
} from '../src/mcp_tools';

describe('TOOL_SCHEMAS_SLIM size reduction', () => {
  const fullJson = JSON.stringify(Object.values(TOOL_SCHEMAS));
  const slimJson = JSON.stringify(Object.values(TOOL_SCHEMAS_SLIM));

  it('slim JSON is materially smaller than full JSON', () => {
    expect(slimJson.length).toBeLessThan(fullJson.length);
    const reduction = 1 - slimJson.length / fullJson.length;
    // Oczekujemy >=40% redukcji; jeśli zejdziemy niżej — test pchnie nas do dalszego odchudzenia.
    expect(reduction).toBeGreaterThanOrEqual(0.4);
  });

  it('slim covers exactly the same tool names as full', () => {
    const fullNames = Object.values(TOOL_SCHEMAS).map((s) => s.name).sort();
    const slimNames = Object.values(TOOL_SCHEMAS_SLIM).map((s) => s.name).sort();
    expect(slimNames).toEqual(fullNames);
  });

  it('slim preserves required[] for each tool', () => {
    for (const [key, slim] of Object.entries(TOOL_SCHEMAS_SLIM)) {
      const full = (TOOL_SCHEMAS as any)[key];
      expect((slim as any).parameters.required ?? []).toEqual(full.parameters.required ?? []);
    }
  });

  it('slim preserves enum values (semantic validation)', () => {
    const fullAnalytics = (TOOL_SCHEMAS as any).run_analytics_query.parameters.properties.queryId.enum;
    const slimAnalytics = (TOOL_SCHEMAS_SLIM as any).run_analytics_query.parameters.properties.queryId.enum;
    expect(slimAnalytics).toEqual(fullAnalytics);
  });

  it('slim preserves additionalProperties: false on update_cart', () => {
    expect((TOOL_SCHEMAS_SLIM as any).update_cart.parameters.additionalProperties).toBe(false);
    expect(
      (TOOL_SCHEMAS_SLIM as any).update_cart.parameters.properties.buyer_identity.additionalProperties,
    ).toBe(false);
  });
});

describe('shouldUseSlimToolSchemas flag parsing', () => {
  it('interprets "true" / "1" / true as slim enabled', () => {
    expect(shouldUseSlimToolSchemas({ SLIM_TOOL_SCHEMAS: 'true' })).toBe(true);
    expect(shouldUseSlimToolSchemas({ SLIM_TOOL_SCHEMAS: 'TRUE' })).toBe(true);
    expect(shouldUseSlimToolSchemas({ SLIM_TOOL_SCHEMAS: '1' })).toBe(true);
    expect(shouldUseSlimToolSchemas({ SLIM_TOOL_SCHEMAS: true })).toBe(true);
  });

  it('treats missing / empty / other strings as disabled (safe default)', () => {
    expect(shouldUseSlimToolSchemas({})).toBe(false);
    expect(shouldUseSlimToolSchemas({ SLIM_TOOL_SCHEMAS: '' })).toBe(false);
    expect(shouldUseSlimToolSchemas({ SLIM_TOOL_SCHEMAS: 'false' })).toBe(false);
    expect(shouldUseSlimToolSchemas({ SLIM_TOOL_SCHEMAS: 'yes' })).toBe(false);
  });
});

describe('resolveToolSchemas / getToolDefinitions', () => {
  it('returns full schemas when flag is disabled', () => {
    const schemas = resolveToolSchemas({});
    expect(schemas).toBe(TOOL_SCHEMAS);
  });

  it('returns slim schemas when flag is "true"', () => {
    const schemas = resolveToolSchemas({ SLIM_TOOL_SCHEMAS: 'true' });
    // resolveToolSchemas returns slim object cast to the full type so the caller
    // always gets the same shape; compare via JSON content, not object identity.
    expect(JSON.stringify(schemas)).toBe(JSON.stringify(TOOL_SCHEMAS_SLIM));
  });

  it('getToolDefinitions() without env preserves backward-compat (full)', () => {
    const defs = getToolDefinitions();
    expect(defs.length).toBe(Object.keys(TOOL_SCHEMAS).length);
    expect(defs[0].type).toBe('function');
  });
});
