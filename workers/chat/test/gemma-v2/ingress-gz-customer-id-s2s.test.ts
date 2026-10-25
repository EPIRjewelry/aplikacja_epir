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
const TEST_GID = 'gid://shopify/Customer/9001002001';

function signHex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
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
    ALLOWED_ORIGINS: 'https://epirbizuteria.pl,https://zareczyny.epirbizuteria.pl',
    SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
    GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
      channelMode: 'internal',
      channelId: 'epir-zareczyny',
      testers: [TEST_GID],
    }),
    ...overrides,
  };
}

function makeGzS2sRequest(customerHeader?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-EPIR-SHARED-SECRET': 'shared-secret',
    'X-EPIR-STOREFRONT-ID': 'zareczyny',
    'X-EPIR-CHANNEL': 'hydrogen-zareczyny',
  };
  if (customerHeader !== undefined) {
    headers['X-EPIR-LOGGED-IN-CUSTOMER-ID'] = customerHeader;
  }
  return new Request('https://asystent.epirbizuteria.pl/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'hej',
      stream: false,
      session_id: 'sess_gz-s2s-e1b',
      brand: 'zareczyny',
    }),
  });
}

function buildSignedAppProxyChatUrl(loggedInCustomerId: string): URL {
  const url = new URL('https://asystent.epirbizuteria.pl/apps/assistant/chat');
  const timestamp = String(Math.floor(Date.now() / 1000));
  url.searchParams.set('shop', 'epir-art-silver-jewellery.myshopify.com');
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('logged_in_customer_id', loggedInCustomerId);
  const signature = signHex(TEST_APP_SECRET, shopifyAppProxyCanonicalString(url.searchParams));
  url.searchParams.set('signature', signature);
  return url;
}

describe('E1b GZ S2S customer id ingress', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T1: S2S GZ + customer header → ingress GID', async () => {
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('gz-ok');
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const env = makeEnv();

    const response = await worker.fetch(makeGzS2sRequest(TEST_GID), env, noopCtx);

    expect(response.status).toBe(200);
    expect(handleSpy).toHaveBeenCalledTimes(1);
    const ingress = handleSpy.mock.calls[0]?.[4];
    expect(ingress?.loggedInCustomerId).toBe(TEST_GID);
  });

  it('T2b: hydrogen-zareczyny channel with wrong storefrontId → loggedInCustomerId null', async () => {
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const env = makeEnv();

    const response = await worker.fetch(
      new Request('https://asystent.epirbizuteria.pl/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EPIR-SHARED-SECRET': 'shared-secret',
          'X-EPIR-STOREFRONT-ID': 'online-store',
          'X-EPIR-CHANNEL': 'hydrogen-zareczyny',
          'X-EPIR-LOGGED-IN-CUSTOMER-ID': TEST_GID,
        },
        body: JSON.stringify({
          message: 'hej',
          stream: false,
          session_id: 'sess_gz-wrong-storefront',
          brand: 'zareczyny',
        }),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    const ingress = handleSpy.mock.calls[0]?.[4];
    expect(ingress?.loggedInCustomerId).toBeNull();
  });

  it('T2: S2S GZ without customer header → loggedInCustomerId null', async () => {
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const env = makeEnv();

    const response = await worker.fetch(makeGzS2sRequest(), env, noopCtx);

    expect(response.status).toBe(200);
    expectBuyerUnavailableJson((await response.json()) as Record<string, unknown>);
    const ingress = handleSpy.mock.calls[0]?.[4];
    expect(ingress?.loggedInCustomerId).toBeNull();
  });

  it('T3: S2S Kazka + GID header matches numeric tester → ingress GID', async () => {
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('kazka-ok');
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const env = makeEnv({
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
        channelMode: 'internal',
        channelId: 'kazka-hydrogen',
        testers: ['9001002001'],
      }),
    });

    const response = await worker.fetch(
      new Request('https://asystent.epirbizuteria.pl/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EPIR-SHARED-SECRET': 'shared-secret',
          'X-EPIR-STOREFRONT-ID': 'kazka',
          'X-EPIR-CHANNEL': 'hydrogen-kazka',
          'X-EPIR-LOGGED-IN-CUSTOMER-ID': TEST_GID,
        },
        body: JSON.stringify({
          message: 'hej',
          stream: false,
          session_id: 'sess_kazka-s2s',
          brand: 'kazka',
        }),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    expect(((await response.json()) as {type: string}).type).toBe('message');
    const ingress = handleSpy.mock.calls[0]?.[4];
    expect(ingress?.loggedInCustomerId).toBe(TEST_GID);
  });

  it('T3b: hydrogen-kazka with wrong storefrontId → loggedInCustomerId null', async () => {
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const env = makeEnv({
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
        channelMode: 'internal',
        channelId: 'kazka-hydrogen',
        testers: ['9001002001'],
      }),
    });

    const response = await worker.fetch(
      new Request('https://asystent.epirbizuteria.pl/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EPIR-SHARED-SECRET': 'shared-secret',
          'X-EPIR-STOREFRONT-ID': 'online-store',
          'X-EPIR-CHANNEL': 'hydrogen-kazka',
          'X-EPIR-LOGGED-IN-CUSTOMER-ID': TEST_GID,
        },
        body: JSON.stringify({
          message: 'hej',
          stream: false,
          session_id: 'sess_kazka-wrong-storefront',
          brand: 'kazka',
        }),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    const ingress = handleSpy.mock.calls[0]?.[4];
    expect(ingress?.loggedInCustomerId).toBeNull();
  });

  it('T4: App Proxy GE + forged S2S customer header → only query id', async () => {
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('ge-ok');
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const env = makeEnv({
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
        channelMode: 'internal',
        testers: [FIKCYJNY_TESTER_ID],
      }),
    });
    const url = buildSignedAppProxyChatUrl(FIKCYJNY_TESTER_ID);

    const response = await worker.fetch(
      new Request(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EPIR-LOGGED-IN-CUSTOMER-ID': TEST_GID,
        },
        body: JSON.stringify({
          message: 'hej',
          stream: false,
          brand: 'epir',
          session_id: 'sess_ge-app-proxy-forged-header',
        }),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    const ingress = handleSpy.mock.calls[0]?.[4];
    expect(ingress?.loggedInCustomerId).toBe(FIKCYJNY_TESTER_ID);
    expect(ingress?.loggedInCustomerId).not.toBe(TEST_GID);
  });

  it('T5: missing S2S secret + customer header → 401', async () => {
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const env = makeEnv();

    const response = await worker.fetch(
      new Request('https://asystent.epirbizuteria.pl/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EPIR-STOREFRONT-ID': 'zareczyny',
          'X-EPIR-CHANNEL': 'hydrogen-zareczyny',
          'X-EPIR-LOGGED-IN-CUSTOMER-ID': TEST_GID,
        },
        body: JSON.stringify({
          message: 'hej',
          stream: false,
          session_id: 'sess_no-secret',
          brand: 'zareczyny',
        }),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain('missing X-EPIR-SHARED-SECRET');
    expect(handleSpy).not.toHaveBeenCalled();
  });

  it('T4b: GZ S2S + GID not on allowlist → unavailable', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const env = makeEnv({
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
        channelMode: 'internal',
        channelId: 'epir-zareczyny',
        testers: [TEST_GID],
      }),
    });

    const response = await worker.fetch(
      makeGzS2sRequest('gid://shopify/Customer/9999999999'),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    expectBuyerUnavailableJson((await response.json()) as Record<string, unknown>);
    expect(composeSpy).not.toHaveBeenCalled();
  });
});
