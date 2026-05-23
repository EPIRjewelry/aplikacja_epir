import { describe, expect, it } from 'vitest';
import {
  getOperatorWorkflowPreset,
  OPERATOR_WORKFLOW_PRESETS,
  operatorWorkflowPresetsJson,
} from '../src/solo-dev-ui/workflow-presets';

describe('operator-workflow-presets', () => {
  it('defines creative trace preset with utility_vector', () => {
    const p = getOperatorWorkflowPreset('creative_trace');
    expect(p).not.toBeNull();
    expect(p?.agentId).toBe('creative_image');
    expect(p?.modelVariant).toBe('or_recraft_v41_utility_vector');
    expect(p?.promptSuffix.length).toBeGreaterThan(20);
  });

  it('serializes all workflows for UI', () => {
    const map = JSON.parse(operatorWorkflowPresetsJson()) as Record<string, { agentId: string }>;
    expect(Object.keys(map).length).toBe(OPERATOR_WORKFLOW_PRESETS.length);
    expect(map.data_shopify.agentId).toBe('internal_analytics');
    expect(map.creative_svg_code.agentId).toBe('creative_svg');
  });

  it('rejects unknown workflow id', () => {
    expect(getOperatorWorkflowPreset('nope')).toBeNull();
  });

  it('defines gdocs brief workflow', () => {
    const p = getOperatorWorkflowPreset('creative_gdocs_brief');
    expect(p?.agentId).toBe('creative_gdocs_brief');
    expect(p?.modelVariant).toBe('or_claude_sonnet_4');
  });

  it('defines data_flow_audit for EDOG', () => {
    const p = getOperatorWorkflowPreset('data_flow_audit');
    expect(p?.agentId).toBe('internal_analytics');
    expect(p?.promptSuffix).toMatch(/EDOG/i);
  });
});
