import {createHmac} from 'node:crypto';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import worker, {SessionDO} from '../../src/index';
import type {Env} from '../../src/config/bindings';
import {shopifyAppProxyCanonicalString} from '../../src/hmac';
import * as buyerTurn from '../../src/buyer/handle-buyer-turn';
import * as compose from '../../src/buyer/compose-buyer-turn';
import {makeDurableStateStub} from '../helpers/session-do-sql-stub';
import {expectBuyerUnavailableJson} from '../helpers/buyer-unavailable';
import {FIKCYJNY_TESTER_ID, makeGemmaRuntimeKv} from './fixtures/fake-testers-kv';

const noopCtx = {waitUntil() {}} as unknown as ExecutionContext;
const TEST_APP_SECRET = 'shopify-app-secret';
const TEST_GID = `gid://shopify/Customer/${FIKCYJNY_TESTER_ID}`;
const SHOP = 'epir-art-silver-jewellery.myshopify.com';

function signHex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeJson(obj: unknown): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(obj)));
}

async function signSessionJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const h = base64UrlEncodeJson({alg: 'HS256', typ: 'JWT'});
  const p = base64UrlEncodeJson(payload);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${base64UrlEncodeBytes(new Uint8Array(sigBuf))}`;
}

function customerJwtPayload(sub: string): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    dest: `https://${SHOP}`,
    aud: 'test-client',
    sub,
    exp: now + 120,
    nbf: now - 10,
    iat: now,
  };
}

function makeNoopNamespace() {
  return {
    idFromName(name: string) {
      return name;
    },
    get() {
      return {
        async fetch() {
          return new Response('ok');
        },
      } as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function makeRateLimiterNamespace() {
  return {
    idFromName(name: string) {
      return name;
    },
    get() {
      return {
        async fetch() {
          return Response.json({allowed: true, retryAfterMs: 0});
        },
      } as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function makeSessionNamespace() {
  return {
    idFromName(name: string) {
      return name;
    },
    get(id: string) {
      const durableState = makeDurableStateStub(String(id));
      const instance = new SessionDO(durableState.state, {} as never);
      return {
        fetch(input: RequestInfo | URL, init?: RequestInit) {
          const request =
            input instanceof Request
              ? input
              : new Request(new URL(String(input), 'https://session').toString(), init);
          return instance.fetch(request);
        },
      } as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SESSION_DO: makeSessionNamespace(),
    RATE_LIMITER_DO: makeRateLimiterNamespace(),
    TOKEN_VAULT_DO: makeNoopNamespace(),
    DB: {} as D1Database,
    DB_CHATBOT: {} as D1Database,
    SHOPIFY_APP_SECRET: TEST_APP_SECRET,
    EPIR_CHAT_SHARED_SECRET: 'shared-secret',
    ALLOWED_ORIGIN: 'https://epirbizuteria.pl',
    SHOP_DOMAIN: SHOP,
    GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
      channelMode: 'internal',
      testers: [FIKCYJNY_TESTER_ID],
    }),
    ...overrides,
  };
}

function buildSignedAppProxyChatUrl(loggedInCustomerId: string): URL {
  const url = new URL('https://asystent.epirbizuteria.pl/apps/assistant/chat');
  url.searchParams.set('shop', SHOP);
  url.searchParams.set('timestamp', String(Math.floor(Date.now() / 1000)));
  url.searchParams.set('logged_in_customer_id', loggedInCustomerId);
  const signature = signHex(TEST_APP_SECRET, shopifyAppProxyCanonicalString(url.searchParams));
  url.searchParams.set('signature', signature);
  return url;
}

function geBody(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    message: 'hej',
    stream: false,
    brand: 'epir',
    session_id: 'sess_ge-jwt',
    ...extra,
  });
}

describe('GE buyer Session Token JWT (ADR 0001 pkt 4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('puste logged_in_customer_id + zweryfikowany JWT sub → ID z tokenu i allow', async () => {
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('ge-jwt');
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const jwt = await signSessionJwt(customerJwtPayload(TEST_GID), TEST_APP_SECRET);
    const env = makeEnv();

    const response = await worker.fetch(
      new Request(buildSignedAppProxyChatUrl('').toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: geBody({customer_id_hint: '9999999999'}),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    expect(((await response.json()) as {type: string}).type).toBe('message');
    const ingress = handleSpy.mock.calls[0]?.[4];
    expect(ingress?.appProxyVerified).toBe(true);
    expect(ingress?.loggedInCustomerId).toBe(TEST_GID);
  });

  it('query ID wygrywa z JWT, nawet gdy query nie jest na liście', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const jwt = await signSessionJwt(customerJwtPayload(TEST_GID), TEST_APP_SECRET);
    const env = makeEnv();
    const queryId = '1111111111';

    const response = await worker.fetch(
      new Request(buildSignedAppProxyChatUrl(queryId).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: geBody(),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    expectBuyerUnavailableJson((await response.json()) as Record<string, unknown>);
    expect(composeSpy).not.toHaveBeenCalled();
    const ingress = handleSpy.mock.calls[0]?.[4];
    expect(ingress?.loggedInCustomerId).toBe(queryId);
  });

  it('customer_id_hint bez query i bez JWT nie ustanawia ID', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const env = makeEnv();

    const response = await worker.fetch(
      new Request(buildSignedAppProxyChatUrl('').toString(), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: geBody({customer_id_hint: FIKCYJNY_TESTER_ID, customer_id_hint_source: 'liquid'}),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    expectBuyerUnavailableJson((await response.json()) as Record<string, unknown>);
    expect(composeSpy).not.toHaveBeenCalled();
    expect(handleSpy.mock.calls[0]?.[4]?.loggedInCustomerId).toBeNull();
  });

  it('zły podpis JWT → puste ID', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const jwt = await signSessionJwt(customerJwtPayload(TEST_GID), 'wrong-secret');
    const env = makeEnv();

    const response = await worker.fetch(
      new Request(buildSignedAppProxyChatUrl('').toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: geBody(),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    expectBuyerUnavailableJson((await response.json()) as Record<string, unknown>);
    expect(composeSpy).not.toHaveBeenCalled();
    expect(handleSpy.mock.calls[0]?.[4]?.loggedInCustomerId).toBeNull();
  });

  it('JWT bez sub Customer GID → puste ID', async () => {
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const jwt = await signSessionJwt(customerJwtPayload('gid://shopify/Staff/1'), TEST_APP_SECRET);
    const env = makeEnv();

    const response = await worker.fetch(
      new Request(buildSignedAppProxyChatUrl('').toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: geBody(),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    expectBuyerUnavailableJson((await response.json()) as Record<string, unknown>);
    expect(handleSpy.mock.calls[0]?.[4]?.loggedInCustomerId).toBeNull();
  });
});
