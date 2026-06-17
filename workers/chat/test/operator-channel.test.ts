import { describe, expect, it } from 'vitest';
import { filterToolSchemasForOperator, OPERATOR_TOOL_ALLOWLIST } from '../src/operator/operator-tool-allowlist';
import { isOperatorChannel } from '../src/operator/operator-channel';
import { getOperatorSystemPrompt } from '../src/operator/operator-system-prompt';
import { resolveToolSchemas } from '../src/mcp_tools';

describe('operator channel v2', () => {
  it('recognizes operator channel', () => {
    expect(isOperatorChannel('operator')).toBe(true);
    expect(isOperatorChannel('online-store')).toBe(false);
  });

  it('allowlist excludes buyer cart tools', () => {
    expect(OPERATOR_TOOL_ALLOWLIST.has('run_analytics_query')).toBe(true);
    expect(OPERATOR_TOOL_ALLOWLIST.has('blender_bridge_invoke')).toBe(true);
    expect(OPERATOR_TOOL_ALLOWLIST.has('operator_shopify_admin_read')).toBe(true);
    expect(OPERATOR_TOOL_ALLOWLIST.has('search_catalog')).toBe(true);
    expect(OPERATOR_TOOL_ALLOWLIST.has('get_cart')).toBe(false);
    expect(OPERATOR_TOOL_ALLOWLIST.has('update_cart')).toBe(false);
  });

  it('filterToolSchemasForOperator returns only allowlisted tools for analyst', () => {
    const schemas = resolveToolSchemas({});
    const filtered = filterToolSchemasForOperator(schemas, 'analyst');
    const names = filtered.map((s) => s.name);
    expect(names).toContain('run_analytics_query');
    expect(names).not.toContain('blender_bridge_invoke');
    expect(names).not.toContain('get_cart');
  });

  it('design_blender role exposes only blender_bridge_invoke', () => {
    const schemas = resolveToolSchemas({});
    const names = filterToolSchemasForOperator(schemas, 'design_blender').map((s) => s.name);
    expect(names).toEqual(['blender_bridge_invoke']);
  });

  it('creative role has no operator tools', () => {
    const schemas = resolveToolSchemas({});
    expect(filterToolSchemasForOperator(schemas, 'creative')).toEqual([]);
  });

  it('design_blender prompt focuses on blender bridge only', () => {
    const prompt = getOperatorSystemPrompt('design_blender');
    expect(prompt).toContain('blender_bridge_invoke');
    expect(prompt).not.toContain('Q1–Q10');
    expect(prompt).not.toContain('fetch_marketing_preview');
  });
});
