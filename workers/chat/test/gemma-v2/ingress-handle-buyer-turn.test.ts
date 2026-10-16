import {createHmac} from 'node:crypto';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import worker, {SessionDO} from '../../src/index';
import type {Env} from '../../src/config/bindings';
import {shopifyAppProxyCanonicalString} from '../../src/hmac';
import * as buyerTurn from '../../src/buyer/handle-buyer-turn';
import * as compose from '../../src/buyer/compose-buyer-turn';
import {makeDurableStateStub} from '../helpers/session-do-sql-stub';
import {FIKCYJNY_TESTER_ID, makeGemmaRuntimeKv} from './fixtures/fake-testers-kv';

const noopCtx = {waitUntil() {}} as unknown as ExecutionContext;
const TEST_APP_SECRET = 'shopify-app-secret';

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
    ALLOWED_ORIGINS: 'https://epirbizuteria.pl',
    SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
    GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
      channelMode: 'internal',
      testers: [FIKCYJNY_TESTER_ID],
    }),
    ...overrides,
  };
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

describe('E1 index.ts → handleBuyerTurn ingress (decyzja 1, M2b/M2c)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('M2b: S2S ?logged_in_customer_id=X → ingress bez App Proxy (null customer id)', async () => {
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const env = makeEnv();

    const response = await worker.fetch(
      new Request(
        `https://asystent.epirbizuteria.pl/chat?logged_in_customer_id=${FIKCYJNY_TESTER_ID}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-EPIR-SHARED-SECRET': 'shared-secret',
            'X-EPIR-STOREFRONT-ID': 'online-store',
            'X-EPIR-CHANNEL': 'online-store',
          },
          body: JSON.stringify({
            message: 'hej',
            stream: false,
            session_id: 'sess_fikcyjny-s2s-ingress',
            brand: 'epir',
          }),
        },
      ),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    expect(handleSpy).toHaveBeenCalledTimes(1);
    const ingress = handleSpy.mock.calls[0]?.[4];
    expect(ingress?.appProxyVerified).not.toBe(true);
    expect(ingress?.loggedInCustomerId).toBeNull();
  });

  it('M2c: signed App Proxy + internal tester → ingress verified + customer id, message', async () => {
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('ingress-ok');
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const env = makeEnv();
    const url = buildSignedAppProxyChatUrl(FIKCYJNY_TESTER_ID);
    const body = JSON.stringify({
      message: 'hej',
      stream: false,
      brand: 'epir',
      session_id: 'sess_fikcyjny-app-proxy-ingress',
    });

    const response = await worker.fetch(
      new Request(url.toString(), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body,
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {type?: string; reply?: string};
    expect(handleSpy).toHaveBeenCalledTimes(1);
    const ingress = handleSpy.mock.calls[0]?.[4];
    expect(ingress?.appProxyVerified).toBe(true);
    expect(ingress?.loggedInCustomerId).toBe(FIKCYJNY_TESTER_ID);
    expect(payload.type).toBe('message');
    expect(payload.reply).toBe('ingress-ok');
  });
});
