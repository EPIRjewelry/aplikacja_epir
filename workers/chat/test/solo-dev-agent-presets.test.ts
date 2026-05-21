import { describe, expect, it } from 'vitest';
import {
  getSoloDevAgentSystemAddon,
  isSoloDevAgentId,
  resolveSoloDevAgentAddonFromHeaders,
  SOLO_DEV_AGENT_PRESETS,
} from '../src/solo-dev-agent-presets';

describe('solo-dev-agent-presets', () => {
  it('exposes creative and analytics agents', () => {
    const ids = SOLO_DEV_AGENT_PRESETS.map((p) => p.id);
    expect(ids).toContain('internal_analytics');
    expect(ids).toContain('creative_svg');
    expect(ids).toContain('creative_blender_flow');
  });

  it('returns addon only with valid operator bearer', () => {
    const env = { EPIR_OPERATOR_PANEL_SECRET: 'sekret-test' };
    const noAuth = resolveSoloDevAgentAddonFromHeaders(
      new Headers({ 'X-EPIR-AGENT-PRESET': 'creative_svg' }),
      env,
    );
    expect(noAuth).toBe('');

    const ok = resolveSoloDevAgentAddonFromHeaders(
      new Headers({
        'X-EPIR-AGENT-PRESET': 'creative_svg',
        Authorization: 'Bearer sekret-test',
      }),
      env,
    );
    expect(ok).toContain('SVG');
    expect(getSoloDevAgentSystemAddon('creative_svg')).toBe(ok);
  });

  it('rejects unknown agent id', () => {
    expect(isSoloDevAgentId('nope')).toBe(false);
    expect(getSoloDevAgentSystemAddon('nope')).toBe('');
  });
});
