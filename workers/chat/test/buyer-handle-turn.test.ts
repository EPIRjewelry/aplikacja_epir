import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleBuyerTurn, BUYER_UNAVAILABLE_JSON } from '../src/buyer/handle-buyer-turn';
import * as channelSwitch from '../src/buyer/channel-switch';
import * as compose from '../src/buyer/compose-buyer-turn';

describe('handleBuyerTurn', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns unavailable when channel mode is off without calling model', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('off');
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');

    const env = {} as import('../src/config/bindings').Env;
    const brandLock = {
      brandKey: 'epir',
      brand: 'epir',
      storefrontId: 'online-store',
      channel: 'online-store',
      source: 'test',
      side: 'buyer',
    };
    const req = new Request('https://example.com/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Cześć' }] }),
    });

    const res = await handleBuyerTurn(req, env, brandLock);
    const json = await res.json();
    expect(json).toEqual(BUYER_UNAVAILABLE_JSON);
    expect(composeSpy).not.toHaveBeenCalled();
  });

  it('runs compose path when mode is internal', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('internal');
    vi.spyOn(channelSwitch, 'channelIdFromBrandLock').mockReturnValue('epir-online-store');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('Odpowiedź testowa');

    const env = {} as import('../src/config/bindings').Env;
    const brandLock = {
      brandKey: 'epir',
      brand: 'epir',
      storefrontId: 'online-store',
      channel: 'online-store',
      source: 'test',
      side: 'buyer',
    };
    const req = new Request('https://example.com/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Szukam pierścionka' }] }),
    });

    const res = await handleBuyerTurn(req, env, brandLock);
    const json = await res.json();
    expect(json.type).toBe('message');
    expect(json.reply).toBe('Odpowiedź testowa');
  });
});
