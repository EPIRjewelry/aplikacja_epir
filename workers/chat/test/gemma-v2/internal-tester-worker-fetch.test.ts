import {describe, expect, it} from 'vitest';
import worker from '../../src/index';
import type {Env} from '../../src/config/bindings';
import {makeDurableStateStub} from '../helpers/session-do-sql-stub';
import {SessionDO} from '../../src/index';
import {expectBuyerUnavailableJson} from '../helpers/buyer-unavailable';
import {FIKCYJNY_TESTER_ID, makeGemmaRuntimeKv} from './fixtures/fake-testers-kv';

const noopCtx = {waitUntil() {}} as unknown as ExecutionContext;

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
    SHOPIFY_APP_SECRET: 'shopify-app-secret',
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

describe('E1 M2b — S2S /chat ignores logged_in_customer_id without App Proxy HMAC', () => {
  it('internal + tester id in query still unavailable (appProxyVerified=false)', async () => {
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
            session_id: 'sess_fikcyjny-s2s-internal',
            brand: 'epir',
          }),
        },
      ),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    expectBuyerUnavailableJson((await response.json()) as Record<string, unknown>);
  });
});
