import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  gemmaChannelKvKey,
  isInternalGemmaAccess,
  resolveGemmaChannelMode,
} from '../src/gemma/channel-gate';

describe('gemma channel gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses KV when bound', async () => {
    const kv = {
      get: async (key: string) => (key === gemmaChannelKvKey('online-store') ? 'on' : null),
    };
    const mode = await resolveGemmaChannelMode(
      {GEMMA_CHANNEL_GATE: kv as KVNamespace, GEMMA_CHANNEL_DEFAULT: 'off'},
      'online-store',
    );
    expect(mode).toBe('on');
  });

  it('fail-closed when KV missing and no env', async () => {
    vi.stubEnv('GEMMA_CHANNEL_DEFAULT', '');
    const mode = await resolveGemmaChannelMode({}, 'hydrogen-kazka');
    expect(mode).toBe('off');
  });

  it('internal requires internal key header', async () => {
    const env = {'GEMMA_CHANNEL_hydrogen-kazka': 'internal', EPIR_INTERNAL_KEY: 'secret'};
    const denied = await resolveGemmaChannelMode(env as any, 'hydrogen-kazka', new Request('https://x'));
    expect(denied).toBe('off');
    const req = new Request('https://x', {headers: {'X-EPIR-Internal-Key': 'secret'}});
    const allowed = await resolveGemmaChannelMode(env as any, 'hydrogen-kazka', req);
    expect(allowed).toBe('internal');
  });

  it('matches internal key helper', () => {
    const req = new Request('https://x', {headers: {'X-EPIR-Internal-Key': 'k'}});
    expect(isInternalGemmaAccess(req, {EPIR_INTERNAL_KEY: 'k'})).toBe(true);
  });
});
