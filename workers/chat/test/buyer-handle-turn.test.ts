import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acceptOrReplaceBuyerSessionId,
  handleBuyerTurn,
  BUYER_CLIENT_ERROR_MESSAGE,
  BUYER_UNAVAILABLE_JSON,
} from '../src/buyer/handle-buyer-turn';
import * as channelSwitch from '../src/buyer/channel-switch';
import * as compose from '../src/buyer/compose-buyer-turn';
import {
  extractLastUserMessage,
  filterToolsForSession,
} from '../src/buyer/compose-buyer-turn';
import type { BuyerToolId } from '../src/buyer/tool-readiness';
import { SessionDO } from '../src/index';
import type { Env } from '../src/config/bindings';
import { makeDurableStateStub } from './helpers/session-do-sql-stub';
import { ensureBuyerSessionContext } from '../src/buyer/session-context';
import {
  readSessionCartId,
  writeSessionCartId,
} from '../src/buyer/session-cart';

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

/** Stub SESSION_DO — ten sam wzorzec co buyer-session-context.test.ts. */
function makeSessionNamespace() {
  const calls: Array<{ path: string; body: unknown; doId: string }> = [];
  const sessions = new Map<string, { instance: SessionDO }>();

  const namespace = {
    idFromName(name: string) {
      return name;
    },
    get(id: string) {
      const key = String(id);
      let session = sessions.get(key);
      if (!session) {
        const durableState = makeDurableStateStub(key);
        session = { instance: new SessionDO(durableState.state, {} as never) };
        sessions.set(key, session);
      }
      return {
        fetch(input: RequestInfo | URL, init?: RequestInit) {
          const request =
            input instanceof Request
              ? input
              : new Request(new URL(String(input), 'https://session').toString(), init);
          const path = new URL(request.url).pathname.replace(/^\//, '');
          if (request.method === 'POST') {
            return request
              .clone()
              .json()
              .then((body) => {
                calls.push({ path, body, doId: key });
                return session!.instance.fetch(request);
              });
          }
          return session!.instance.fetch(request);
        },
      } as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;

  return { namespace, calls };
}

const CART_GID = 'gid://shopify/Cart/E1-TURN';

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

  it('parts-only body returns 200 and always echoes session_id', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(channelSwitch, 'channelIdFromBrandLock').mockReturnValue('epir-online-store');
    const composeSpy = vi
      .spyOn(compose, 'composeBuyerAssistantReply')
      .mockResolvedValue('OK');

    const env = {} as import('../src/config/bindings').Env;
    const body = { parts: [{ type: 'text', text: 'czesc' }] };

    const res = await handleBuyerTurn(postReq(body), env, buyerBrandLock(), body);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { reply?: string; session_id?: string };
    expect(json.reply).toBe('OK');
    expect(json.session_id).toMatch(/^sess_[0-9a-f-]{36}$/i);
    expect(composeSpy.mock.calls[0]?.[4]?.sessionId).toBe(json.session_id);
  });

  it('legacy messages[] returns 200 with minted session_id when body omits it', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('internal');
    vi.spyOn(channelSwitch, 'channelIdFromBrandLock').mockReturnValue('epir-online-store');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('Odpowiedź testowa');

    const env = {} as import('../src/config/bindings').Env;
    const body = { messages: [{ role: 'user', content: 'Szukam pierścionka' }] };

    const res = await handleBuyerTurn(postReq(body), env, buyerBrandLock(), body);
    const json = (await res.json()) as { type?: string; reply?: string; session_id?: string };
    expect(json.type).toBe('message');
    expect(json.reply).toBe('Odpowiedź testowa');
    expect(json.session_id).toMatch(/^sess_/);
  });

  it('tura 1 bez session_id → mint; tura 2 z tym id odczytuje koszyk z SessionDO', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(channelSwitch, 'channelIdFromBrandLock').mockReturnValue('epir-online-store');

    const { namespace, calls } = makeSessionNamespace();
    const env = { SESSION_DO: namespace } as Env;

    vi.spyOn(compose, 'composeBuyerAssistantReply').mockImplementation(
      async (_env, channelId, userText, _req, opts) => {
        const sid = opts?.sessionId;
        await ensureBuyerSessionContext(_env, {
          sessionId: sid,
          channelId,
          storefrontId: 'online-store',
          bodyChannel: 'online-store',
          userText,
        });
        if (userText.includes('SAVE_CART') && sid) {
          await writeSessionCartId(_env, sid, CART_GID);
          return 'saved';
        }
        if (userText.includes('READ_CART') && sid) {
          const cart = await readSessionCartId(_env, sid);
          return `cart:${cart ?? 'none'}`;
        }
        return 'ok';
      },
    );

    const body1 = { message: 'SAVE_CART please' };
    const res1 = await handleBuyerTurn(postReq(body1), env, buyerBrandLock(), body1);
    const json1 = (await res1.json()) as { session_id?: string; reply?: string };
    expect(res1.status).toBe(200);
    expect(json1.session_id).toMatch(/^sess_[0-9a-f-]{36}$/i);
    expect(json1.reply).toBe('saved');

    const minted = json1.session_id!;
    const setSid1 = calls.filter(
      (c) => c.path === 'set-session-id' && c.doId === minted,
    );
    expect(setSid1.length).toBeGreaterThanOrEqual(1);
    expect(
      calls.some(
        (c) =>
          c.path === 'set-cart-id' &&
          c.doId === minted &&
          (c.body as { cart_id?: string })?.cart_id === CART_GID,
      ),
    ).toBe(true);

    const callsBeforeTurn2 = calls.length;
    const body2 = { message: 'READ_CART now', session_id: minted };
    const res2 = await handleBuyerTurn(postReq(body2), env, buyerBrandLock(), body2);
    const json2 = (await res2.json()) as { session_id?: string; reply?: string };
    expect(res2.status).toBe(200);
    expect(json2.session_id).toBe(minted);
    expect(json2.reply).toBe(`cart:${CART_GID}`);

    const turn2Calls = calls.slice(callsBeforeTurn2);
    expect(
      turn2Calls.some((c) => c.path === 'set-session-id' && c.doId === minted),
    ).toBe(true);
    expect(turn2Calls.every((c) => c.doId === minted || c.path === 'cart-id')).toBe(
      true,
    );
    // Brak nowego UUID — wszystkie POST w turze 2 na tym samym DO id.
    const turn2DoIds = [...new Set(turn2Calls.map((c) => c.doId))];
    expect(turn2DoIds).toEqual([minted]);
  });

  it('rejects invalid session_id: mint trafia do SessionDO; surowa wartość poza logami', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(channelSwitch, 'channelIdFromBrandLock').mockReturnValue('epir-online-store');

    const { namespace, calls } = makeSessionNamespace();
    const env = { SESSION_DO: namespace } as Env;

    vi.spyOn(compose, 'composeBuyerAssistantReply').mockImplementation(
      async (_env, channelId, userText, _req, opts) => {
        const sid = opts?.sessionId;
        await ensureBuyerSessionContext(_env, {
          sessionId: sid,
          channelId,
          storefrontId: 'online-store',
          bodyChannel: 'online-store',
          userText,
        });
        if (sid) await writeSessionCartId(_env, sid, CART_GID);
        return 'OK';
      },
    );

    const logSpy = vi.spyOn(console, 'log');
    const warnSpy = vi.spyOn(console, 'warn');
    const errorSpy = vi.spyOn(console, 'error');

    const dumpLogs = () =>
      [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
        .map((c) => c.map(String).join(' '))
        .join('\n');

    const evil = '; DROP TABLE sessions; --';
    const bodyEvil = { message: 'czesc', session_id: evil };
    const resEvil = await handleBuyerTurn(
      postReq(bodyEvil),
      env,
      buyerBrandLock(),
      bodyEvil,
    );
    const jsonEvil = (await resEvil.json()) as { session_id?: string };
    expect(resEvil.status).toBe(200);
    expect(jsonEvil.session_id).toMatch(/^sess_[0-9a-f-]{36}$/i);
    expect(jsonEvil.session_id).not.toBe(evil);
    const mintedEvil = jsonEvil.session_id!;
    expect(
      calls.some(
        (c) =>
          c.path === 'set-session-id' &&
          c.doId === mintedEvil &&
          (c.body as { session_id?: string })?.session_id === mintedEvil,
      ),
    ).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.path === 'set-cart-id' &&
          c.doId === mintedEvil &&
          (c.body as { cart_id?: string })?.cart_id === CART_GID,
      ),
    ).toBe(true);
    expect(calls.every((c) => c.doId !== evil && !JSON.stringify(c.body).includes(evil))).toBe(
      true,
    );
    expect(dumpLogs()).not.toContain(evil);

    const longId = 'x'.repeat(500);
    const callsBeforeLong = calls.length;
    const bodyLong = { message: 'czesc', session_id: longId };
    const resLong = await handleBuyerTurn(
      postReq(bodyLong),
      env,
      buyerBrandLock(),
      bodyLong,
    );
    const jsonLong = (await resLong.json()) as { session_id?: string };
    expect(jsonLong.session_id).toMatch(/^sess_/);
    expect(jsonLong.session_id).not.toBe(longId);
    const mintedLong = jsonLong.session_id!;
    const longCalls = calls.slice(callsBeforeLong);
    expect(
      longCalls.some((c) => c.path === 'set-session-id' && c.doId === mintedLong),
    ).toBe(true);
    expect(longCalls.every((c) => c.doId === mintedLong)).toBe(true);
    expect(dumpLogs()).not.toContain(longId);
  });

  it('acceptOrReplaceBuyerSessionId keeps valid ids and replaces bad ones', () => {
    expect(acceptOrReplaceBuyerSessionId('s1')).toBe('s1');
    expect(acceptOrReplaceBuyerSessionId('sess_abc-123')).toBe('sess_abc-123');
    expect(acceptOrReplaceBuyerSessionId('; DROP')).toMatch(/^sess_/);
    expect(acceptOrReplaceBuyerSessionId('x'.repeat(500))).toMatch(/^sess_/);
    expect(acceptOrReplaceBuyerSessionId(undefined)).toMatch(/^sess_/);
  });

  it('filterToolsForSession keeps ucp_cart when minted session_id is present', () => {
    const tools: BuyerToolId[] = ['ucp_cart', 'get_size_table'];
    expect(filterToolsForSession(tools, undefined)).not.toContain('ucp_cart');
    expect(
      filterToolsForSession(tools, 'sess_00000000-0000-4000-8000-000000000001'),
    ).toContain('ucp_cart');
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
    expect(json.error).toBe(BUYER_CLIENT_ERROR_MESSAGE);
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
