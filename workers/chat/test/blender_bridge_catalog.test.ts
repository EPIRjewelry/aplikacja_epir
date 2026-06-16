import { describe, expect, it } from 'vitest';
import catalog from '../src/blender-bridge-tools.json';
import {
  BLENDER_BRIDGE_TOOL_NAMES,
  blenderBridgeToolEnumForSchema,
  isBlenderBridgeToolDenied,
  isBlenderBridgeToolKnown,
  resolveBridgeToolName,
} from '../src/blender-bridge-tool-catalog';

describe('blender-bridge-tool-catalog', () => {
  it('lists 32 bridge tools including run_script and node_tool_invoke', () => {
    expect(BLENDER_BRIDGE_TOOL_NAMES.length).toBe(32);
    expect(BLENDER_BRIDGE_TOOL_NAMES).toContain('curve_cutter_create');
    expect(BLENDER_BRIDGE_TOOL_NAMES).toContain('run_script');
    expect(BLENDER_BRIDGE_TOOL_NAMES).toContain('node_tool_invoke');
  });

  it('has empty denylist (solo operator — addon gates run_script)', () => {
    expect(catalog.denied).toEqual([]);
    expect(isBlenderBridgeToolDenied('run_script')).toBe(false);
    expect(isBlenderBridgeToolDenied('node_tool_invoke')).toBe(false);
  });

  it('resolves blender_add_curve alias', () => {
    expect(resolveBridgeToolName('blender_add_curve')).toBe('curve_cutter_create');
    expect(isBlenderBridgeToolKnown('blender_add_curve')).toBe(true);
  });

  it('includes aliases in schema enum', () => {
    const names = blenderBridgeToolEnumForSchema();
    expect(names).toContain('curve_cutter_create');
    expect(names).toContain('blender_add_curve');
    expect(names.length).toBeGreaterThan(BLENDER_BRIDGE_TOOL_NAMES.length);
  });

  it('matches committed JSON tool count', () => {
    expect(catalog.tools.map((t) => t.name).sort()).toEqual([...BLENDER_BRIDGE_TOOL_NAMES].sort());
  });
});
