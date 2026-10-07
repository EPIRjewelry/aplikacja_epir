import {describe, expect, it, vi} from 'vitest';
import {
  catalogSnapshotChannel,
  channelIdFromBrandLock,
  readChannelMode,
} from '../src/buyer/channel-switch';
import type {ChatBrandLock} from '../src/brand-lock';

function lock(partial: Partial<ChatBrandLock>): ChatBrandLock {
  return {
    brandKey: 'epir',
    brand: 'epir',
    channel: 'online-store',
    storefrontId: 'online-store',
    side: 'epir',
    source: 'ingress',
    ...partial,
  };
}

describe('channel-switch', () => {
  it('maps zaręczyny to epir-zareczyny (shares GE snapshot)', () => {
    expect(
      channelIdFromBrandLock(lock({brandKey: 'zareczyny', channel: 'hydrogen-zareczyny', side: 'zareczyny'})),
    ).toBe('epir-zareczyny');
    expect(catalogSnapshotChannel('epir-zareczyny')).toBe('epir-online-store');
  });

  it('fail-closed without KV binding', async () => {
    expect(await readChannelMode({}, 'epir-zareczyny')).toBe('off');
  });

  it('returns stored mode when valid', async () => {
    const kv = {
      async get(key: string) {
        if (key === 'gemma:channel:epir-zareczyny') return 'on';
        return null;
      },
    } as KVNamespace;
    expect(await readChannelMode({GEMMA_RUNTIME_KV: kv}, 'epir-zareczyny')).toBe('on');
  });

  it('unknown KV value → off', async () => {
    const kv = {async get() { return 'maybe'; }} as KVNamespace;
    expect(await readChannelMode({GEMMA_RUNTIME_KV: kv}, 'kazka-hydrogen')).toBe('off');
  });
});

describe('buyer turn (PR1 always unavailable)', () => {
  it('does not call model for on/internal/off', async () => {
    const ai = await import('../src/ai-client');
    const spy = vi.spyOn(ai, 'getGroqResponse').mockResolvedValue({content: 'x'} as never);
    const {handleBuyerTurn} = await import('../src/buyer/handle-buyer-turn');
    for (const mode of ['off', 'on', 'internal'] as const) {
      const kv = {
        async get(key: string) {
          return key.includes('epir-online-store') ? mode : null;
        },
      } as KVNamespace;
      const res = await handleBuyerTurn(
        new Request('https://x/chat', {
          method: 'POST',
          headers: {
            'X-Epir-Model-Variant': 'kimi_k25',
            'X-Epir-OpenRouter-Model': 'openrouter/openai/gpt-4o',
            Authorization: 'Bearer fake',
          },
        }),
        {GEMMA_RUNTIME_KV: kv, ALLOWED_ORIGIN: '*'} as import('../src/config/bindings').Env,
        lock({}),
      );
      expect(res.status).toBe(200);
      expect(((await res.json()) as {type: string}).type).toBe('unavailable');
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
