import { describe, expect, it } from 'vitest';
import { shopifyAppProxyCanonicalString } from '../src/hmac';
import worker, { SessionDO } from '../src/index';
import type { Env } from '../src/config/bindings';
import { computeHmac } from '../src/hmac';

const noopCtx = { waitUntil() {} } as unknown as ExecutionContext;

function makeDurableStateStub(storage = new Map<string, any>()) {
  return {
    storage: {
      async get(key: string) {
        return storage.has(key) ? storage.get(key) : undefined;
      },
      async put(key: string, value: any) {
        storage.set(key, value);
      },
    },
    async blockConcurrencyWhile(cb: () => Promise<void>) {
      await cb();
    },
  } as unknown as DurableObjectState;
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

function makeSessionNamespace() {
  const sessions = new Map<string, { storage: Map<string, any>; instance: SessionDO }>();

  return {
    namespace: {
      idFromName(name: string) {
        return name;
      },
      get(id: string) {
        const key = String(id);
        let session = sessions.get(key);
        if (!session) {
          const storage = new Map<string, any>();
          session = {
            storage,
            instance: new SessionDO(makeDurableStateStub(storage), {} as any),
          };
          sessions.set(key, session);
        }

        return {
          fetch(input: RequestInfo | URL, init?: RequestInit) {
            const request = input instanceof Request
              ? input
              : new Request(new URL(String(input), 'https://session').toString(), init);
            return session!.instance.fetch(request);
          },
        } as DurableObjectStub;
      },
    } as unknown as DurableObjectNamespace,
    sessions,
  };
}

function makeD1Capture() {
  const inserts: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              inserts.push({ sql, args });
              return { success: true, meta: {} };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, inserts };
}

function makeEnv(overrides: Partial<Env> = {}) {
  const sessionNamespace = makeSessionNamespace();
  const { db, inserts } = makeD1Capture();

  const env: Env = {
    SESSION_DO: sessionNamespace.namespace,
    RATE_LIMITER_DO: makeNoopNamespace(),
    TOKEN_VAULT_DO: makeNoopNamespace(),
    DB: {} as D1Database,
    DB_CHATBOT: db,
    SHOPIFY_APP_SECRET: 'shopify-app-secret',
    EPIR_CHAT_SHARED_SECRET: 'shared-secret',
    ALLOWED_ORIGIN: 'https://epirbizuteria.pl',
    ALLOWED_ORIGINS: 'https://epirbizuteria.pl,https://zareczyny.epirbizuteria.pl',
    SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
    ...overrides,
  };

  return { env, inserts };
}

function consentPayload(overrides: Record<string, unknown> = {}) {
  return {
    consentId: 's2s-consent-1',
    granted: false,
    source: 'hydrogen',
    sessionId: 'sess-s2s',
    timestamp: 1_712_111_000_000,
    route: '/products/ring',
    anonymousId: 'anon-s2s',
    customerId: '999',
    ...overrides,
  };
}

function makeS2SRequest(body: Record<string, unknown>, url = 'https://asystent.epirbizuteria.pl/consent') {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-EPIR-SHARED-SECRET': 'shared-secret',
      'X-EPIR-STOREFRONT-ID': 'zareczyny',
      'X-EPIR-CHANNEL': 'hydrogen-zareczyny',
    },
    body: JSON.stringify(body),
  });
}

async function makeSignedConsentRequest(url: string, body: Record<string, unknown>) {
  const parsed = new URL(url);
  const canonical = shopifyAppProxyCanonicalString(parsed.searchParams);
  const signature = await computeHmac('shopify-app-secret', canonical);
  parsed.searchParams.set('signature', signature);

  return new Request(parsed.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('S2S ingress POST /consent', () => {
  it('returns 401 without shared secret', async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(
      new Request('https://asystent.epirbizuteria.pl/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EPIR-STOREFRONT-ID': 'zareczyny',
          'X-EPIR-CHANNEL': 'hydrogen-zareczyny',
        },
        body: JSON.stringify(consentPayload()),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain('missing X-EPIR-SHARED-SECRET');
  });

  it('returns 401 when shared secret is invalid', async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(
      new Request('https://asystent.epirbizuteria.pl/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EPIR-SHARED-SECRET': 'wrong',
          'X-EPIR-STOREFRONT-ID': 'zareczyny',
          'X-EPIR-CHANNEL': 'hydrogen-zareczyny',
        },
        body: JSON.stringify(consentPayload()),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain('invalid X-EPIR-SHARED-SECRET');
  });

  it('returns 400 when storefront header is missing', async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(
      new Request('https://asystent.epirbizuteria.pl/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EPIR-SHARED-SECRET': 'shared-secret',
          'X-EPIR-CHANNEL': 'hydrogen-zareczyny',
        },
        body: JSON.stringify(consentPayload()),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('missing X-EPIR-STOREFRONT-ID');
  });

  it('returns 204 and uses S2S headers as storefront_id and channel', async () => {
    const { env, inserts } = makeEnv();
    const response = await worker.fetch(makeS2SRequest(consentPayload()), env, noopCtx);

    expect(response.status).toBe(204);
    expect(inserts.length).toBe(1);
    const args = inserts[0].args;
    expect(args[0]).toBe('s2s-consent-1');
    expect(args[1]).toBe(0);
    expect(args[3]).toBe('zareczyny');
    expect(args[4]).toBe('hydrogen-zareczyny');
    expect(args[9]).toBe('999');
  });

  it('returns 400 when consentId is missing', async () => {
    const { env } = makeEnv();
    const body = consentPayload();
    delete (body as Record<string, unknown>).consentId;
    const response = await worker.fetch(makeS2SRequest(body), env, noopCtx);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('consentId required');
  });

  it('routes signed /consent through App Proxy auth and persists canonical storefront', async () => {
    const { env, inserts } = makeEnv();
    const nowTs = Math.floor(Date.now() / 1000);
    const request = await makeSignedConsentRequest(
      `https://asystent.epirbizuteria.pl/consent?shop=epir-art-silver-jewellery.myshopify.com&timestamp=${nowTs}`,
      consentPayload({
        consentId: 'via-proxy',
        granted: true,
        storefrontId: 'should-be-ignored',
        channel: 'should-be-ignored',
      }),
    );

    const response = await worker.fetch(request, env, noopCtx);

    expect(response.status).toBe(204);
    expect(inserts[0].args[3]).toBe('online-store');
    expect(inserts[0].args[4]).toBe('online-store');
  });
});
