import {describe, expect, it, vi} from 'vitest';
import {channelIdFromBrandLock, readChannelMode} from '../src/buyer/channel-switch';
import type {BrandLockResult} from '../src/brand-lock';

function lock(partial: Partial<BrandLockResult>): BrandLockResult {
  return {
    brandKey: 'epir',
    channel: 'online-store',
    storefrontId: 'online-store',
    side: 'buyer',
    source: 'header',
    ...partial,
  } as BrandLockResult;
}

describe('channel-switch', () => {
  it('maps zaręczyny to null channel', () => {
    expect(channelIdFromBrandLock(lock({brandKey: 'zareczyny', channel: 'hydrogen-zareczyny'}))).toBeNull();
  });

  it('fail-closed without KV binding', async () => {
    expect(await readChannelMode({}, 'epir-online-store')).toBe('off');
  });

  it('returns stored mode when valid', async () => {
    const kv = {
      async get(key: string) {
        if (key === 'gemma:channel:epir-online-store') return 'on';
        return null;
      },
    } as KVNamespace;
    expect(await readChannelMode({GEMMA_RUNTIME_KV: kv}, 'epir-online-store')).toBe('on');
  });

  it('unknown KV value → off', async () => {
    const kv = {
      async get() {
        return 'maybe';
      },
    } as KVNamespace;
    expect(await readChannelMode({GEMMA_RUNTIME_KV: kv}, 'kazka-hydrogen')).toBe('off');
  });
});

describe('buyer turn (PR1 always unavailable)', () => {
  it('does not call model for on/internal/off', async () => {
    const ai = await import('../src/ai-client');
    const spy = vi.spyOn(ai, 'getGroqResponse').mockResolvedValue({content: 'x'} as never);
    const {handleBuyerTurn} = await import('../src/buyer/handle-buyer-turn');
    const modes = ['off', 'on', 'internal'] as const;
    for (const mode of modes) {
      const kv = {
        async get(key: string) {
          return key.includes('epir') ? mode : null;
        },
      } as KVNamespace;
      const res = await handleBuyerTurn(
        new Request('https://x/chat', {method: 'POST'}),
        {GEMMA_RUNTIME_KV: kv, ALLOWED_ORIGIN: '*'} as import('../src/config/bindings').Env,
        lock({}),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {type: string};
      expect(body.type).toBe('unavailable');
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
