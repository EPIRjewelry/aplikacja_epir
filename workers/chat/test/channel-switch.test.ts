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

describe('buyer turn channel gate', () => {
  it('off → unavailable without calling model; on/internal → compose path', async () => {
    const ai = await import('../src/ai-client');
    const spy = vi.spyOn(ai, 'getGroqResponse').mockResolvedValue('odpowiedź testowa');
    const toolReadiness = await import('../src/buyer/tool-readiness');
    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([]);
    const aiProfile = await import('../src/ai-profile');
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
    const facts = await import('../src/facts');
    vi.spyOn(facts, 'getCatalogRepository').mockRejectedValue(new Error('skip'));

    const {handleBuyerTurn} = await import('../src/buyer/handle-buyer-turn');

    const offKv = {
      async get(key: string) {
        return key.includes('epir-online-store') ? 'off' : null;
      },
    } as KVNamespace;
    const offBody = {messages: [{role: 'user', content: 'Cześć'}]};
    const offRes = await handleBuyerTurn(
      new Request('https://x/chat', {
        method: 'POST',
        body: JSON.stringify(offBody),
        headers: {'Content-Type': 'application/json'},
      }),
      {GEMMA_RUNTIME_KV: offKv, ALLOWED_ORIGIN: '*'} as import('../src/config/bindings').Env,
      lock({}),
      offBody,
    );
    expect(offRes.status).toBe(200);
    expect(((await offRes.json()) as {type: string}).type).toBe('unavailable');
    expect(spy).not.toHaveBeenCalled();

    spy.mockClear();
    const onKv = {
      async get(key: string) {
        return key.includes('epir-online-store') ? 'on' : null;
      },
    } as KVNamespace;
    const onBody = {messages: [{role: 'user', content: 'Szukam pierścionka'}]};
    const onRes = await handleBuyerTurn(
      new Request('https://x/chat', {
        method: 'POST',
        body: JSON.stringify(onBody),
        headers: {'Content-Type': 'application/json'},
      }),
      {
        GEMMA_RUNTIME_KV: onKv,
        ALLOWED_ORIGIN: '*',
        SHOP_DOMAIN: 'shop.myshopify.com',
      } as import('../src/config/bindings').Env,
      lock({}),
      onBody,
    );
    expect(onRes.status).toBe(200);
    const onJson = (await onRes.json()) as {type: string; reply?: string};
    expect(onJson.type).toBe('message');
    expect(onJson.reply).toBe('odpowiedź testowa');
    expect(spy).toHaveBeenCalled();

    spy.mockClear();
    const internalKv = {
      async get(key: string) {
        return key.includes('epir-online-store') ? 'internal' : null;
      },
    } as KVNamespace;
    const internalBody = {messages: [{role: 'user', content: 'Szukam pierścionka'}]};
    const internalRes = await handleBuyerTurn(
      new Request('https://x/chat', {
        method: 'POST',
        body: JSON.stringify(internalBody),
        headers: {'Content-Type': 'application/json'},
      }),
      {
        GEMMA_RUNTIME_KV: internalKv,
        ALLOWED_ORIGIN: '*',
        SHOP_DOMAIN: 'shop.myshopify.com',
      } as import('../src/config/bindings').Env,
      lock({}),
      internalBody,
    );
    expect(internalRes.status).toBe(200);
    expect(((await internalRes.json()) as {type: string}).type).toBe('unavailable');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
