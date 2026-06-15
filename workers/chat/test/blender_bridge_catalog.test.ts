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
  it('lists 30 bridge tools with curve_cutter_create', () => {
    expect(BLENDER_BRIDGE_TOOL_NAMES.length).toBe(30);
    expect(BLENDER_BRIDGE_TOOL_NAMES).toContain('curve_cutter_create');
    expect(BLENDER_BRIDGE_TOOL_NAMES).toContain('modifier_add_boolean_manifold');
  });

  it('denies only run_script and node_tool_invoke', () => {
    expect(catalog.denied).toEqual(['node_tool_invoke', 'run_script']);
    expect(isBlenderBridgeToolDenied('run_script')).toBe(true);
    expect(isBlenderBridgeToolDenied('curve_cutter_create')).toBe(false);
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
