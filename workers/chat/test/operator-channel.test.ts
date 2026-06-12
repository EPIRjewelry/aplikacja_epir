import { describe, expect, it } from 'vitest';
import { filterToolSchemasForOperator, OPERATOR_TOOL_ALLOWLIST } from '../src/operator/operator-tool-allowlist';
import { isOperatorChannel } from '../src/operator/operator-channel';
import { resolveToolSchemas } from '../src/mcp_tools';

describe('operator channel v2', () => {
  it('recognizes operator channel', () => {
    expect(isOperatorChannel('operator')).toBe(true);
    expect(isOperatorChannel('internal-dashboard')).toBe(false);
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

  it('filterToolSchemasForOperator returns only allowlisted tools', () => {
    const schemas = resolveToolSchemas({});
    const filtered = filterToolSchemasForOperator(schemas);
    const names = filtered.map((s) => s.name);
    expect(names).toContain('run_analytics_query');
    expect(names).not.toContain('get_cart');
    expect(names).not.toContain('update_cart');
    expect(filtered.every((s) => OPERATOR_TOOL_ALLOWLIST.has(s.name))).toBe(true);
  });
});
