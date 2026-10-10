import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleBuyerTurn, BUYER_UNAVAILABLE_JSON } from '../src/buyer/handle-buyer-turn';
import * as channelSwitch from '../src/buyer/channel-switch';
import * as compose from '../src/buyer/compose-buyer-turn';
import { extractLastUserMessage } from '../src/buyer/compose-buyer-turn';

const noopCtx = { waitUntil() {} } as unknown as ExecutionContext;

function buyerBrandLock() {
  return {
    brandKey: 'epir',
    brand: 'epir',
    storefrontId: 'online-store',
    channel: 'online-store',
    source: 'test' as const,
    side: 'epir' as const,
  };
}

function postReq(body: Record<string, unknown>) {
  return new Request('https://example.com/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('extractLastUserMessage', () => {
  it('prefers message string over parts and messages', () => {
    expect(
      extractLastUserMessage({
        message: ' z message ',
        parts: [{ type: 'text', text: 'parts' }],
        messages: [{ role: 'user', content: 'legacy' }],
      }),
    ).toBe('z message');
  });

  it('reads parts text when message is empty', () => {
    expect(extractLastUserMessage({ parts: [{ type: 'text', text: 'czesc' }] })).toBe('czesc');
  });

  it('reads legacy messages[]', () => {
    expect(
      extractLastUserMessage({ messages: [{ role: 'user', content: 'legacy' }] }),
    ).toBe('legacy');
  });
});

describe('handleBuyerTurn', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns unavailable when channel mode is off without calling model', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('off');
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');

    const env = {} as import('../src/config/bindings').Env;
    const body = { messages: [{ role: 'user', content: 'Cześć' }] };
    const req = postReq(body);

    const res = await handleBuyerTurn(req, env, buyerBrandLock(), body);
    const json = await res.json();
    expect(json).toEqual(BUYER_UNAVAILABLE_JSON);
    expect(composeSpy).not.toHaveBeenCalled();
  });

  it('widget message + session_id with mode on returns 200 and echoes session_id', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(channelSwitch, 'channelIdFromBrandLock').mockReturnValue('epir-online-store');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('Odpowiedź testowa');

    const env = {} as import('../src/config/bindings').Env;
    const body = { message: 'czesc', session_id: 's1', stream: true };

    const res = await handleBuyerTurn(postReq(body), env, buyerBrandLock(), body);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.type).toBe('message');
    expect(json.reply).toBe('Odpowiedź testowa');
    expect(json.session_id).toBe('s1');
  });

  it('parts-only body returns 200', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(channelSwitch, 'channelIdFromBrandLock').mockReturnValue('epir-online-store');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('OK');

    const env = {} as import('../src/config/bindings').Env;
    const body = { parts: [{ type: 'text', text: 'czesc' }] };

    const res = await handleBuyerTurn(postReq(body), env, buyerBrandLock(), body);
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe('OK');
  });

  it('legacy messages[] returns 200', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('internal');
    vi.spyOn(channelSwitch, 'channelIdFromBrandLock').mockReturnValue('epir-online-store');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('Odpowiedź testowa');

    const env = {} as import('../src/config/bindings').Env;
    const body = { messages: [{ role: 'user', content: 'Szukam pierścionka' }] };

    const res = await handleBuyerTurn(postReq(body), env, buyerBrandLock(), body);
    const json = await res.json();
    expect(json.type).toBe('message');
    expect(json.reply).toBe('Odpowiedź testowa');
  });

  it('empty user text returns 400 with customer error field', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(channelSwitch, 'channelIdFromBrandLock').mockReturnValue('epir-online-store');

    const env = {} as import('../src/config/bindings').Env;
    const body = { message: '   ', session_id: 's1' };

    const res = await handleBuyerTurn(postReq(body), env, buyerBrandLock(), body);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.reason).toBe('missing_user_message');
    expect(json.error).toBe('Nie udało się odczytać wiadomości.');
  });

  it('handleChat passes parsed body once — widget payload is not 400', async () => {
    const { handleChat } = await import('../src/index');
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(channelSwitch, 'channelIdFromBrandLock').mockReturnValue('epir-online-store');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('Witaj');

    const env = {
      GEMMA_RUNTIME_KV: {
        async get() {
          return 'on';
        },
      } as KVNamespace,
      ALLOWED_ORIGIN: '*',
      SHOP_DOMAIN: 'shop.myshopify.com',
    } as import('../src/config/bindings').Env;

    const body = {
      message: 'czesc',
      session_id: 'widget-session-1',
      stream: true,
      brand: 'epir',
      channel: 'online-store',
    };
    const req = new Request('https://asystent.epirbizuteria.pl/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await handleChat(req, env, undefined, noopCtx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.type).toBe('message');
    expect(json.reply).toBe('Witaj');
    expect(json.session_id).toBe('widget-session-1');
  });
});
