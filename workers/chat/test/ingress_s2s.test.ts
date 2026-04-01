import { describe, expect, it } from 'vitest';
import worker, { SessionDO, parseChatRequestBody } from '../src/index';
import type { Env } from '../src/config/bindings';

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
            const request = input instanceof Request ? input : new Request(input, init);
            return session!.instance.fetch(request);
          },
        } as DurableObjectStub;
      },
    } as unknown as DurableObjectNamespace,
    sessions,
  };
}

function makeEnv(overrides: Partial<Env> = {}) {
  const sessionNamespace = makeSessionNamespace();
  const env: Env = {
    SESSION_DO: sessionNamespace.namespace,
    RATE_LIMITER_DO: makeNoopNamespace(),
    TOKEN_VAULT_DO: makeNoopNamespace(),
    DB: {} as D1Database,
    DB_CHATBOT: {} as D1Database,
    SHOPIFY_APP_SECRET: 'shopify-app-secret',
    EPIR_CHAT_SHARED_SECRET: 'shared-secret',
    ALLOWED_ORIGIN: 'https://epirbizuteria.pl',
    ALLOWED_ORIGINS: 'https://epirbizuteria.pl,https://zareczyny.epirbizuteria.pl',
    GROQ_API_KEY: 'test-groq-key',
    SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
    ...overrides,
  };

  return { env, sessions: sessionNamespace.sessions };
}

function makeChatRequest(headers: HeadersInit = {}, body?: Record<string, unknown>) {
  return new Request('https://asystent.epirbizuteria.pl/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(
      body ?? {
        message: 'hej',
        stream: false,
        storefrontId: 'body-storefront',
        channel: 'body-channel',
        brand: 'zareczyny',
      },
    ),
  });
}

describe('S2S ingress for /chat', () => {
  it('rejects request without shared secret', async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(
      makeChatRequest({
        'X-EPIR-STOREFRONT-ID': 'zareczyny',
        'X-EPIR-CHANNEL': 'hydrogen-zareczyny',
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain('missing X-EPIR-SHARED-SECRET');
  });

  it('rejects request with invalid shared secret', async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(
      makeChatRequest({
        'X-EPIR-SHARED-SECRET': 'wrong-secret',
        'X-EPIR-STOREFRONT-ID': 'zareczyny',
        'X-EPIR-CHANNEL': 'hydrogen-zareczyny',
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain('invalid X-EPIR-SHARED-SECRET');
  });

  it('rejects request without storefront header even if body provides storefrontId', async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(
      makeChatRequest({
        'X-EPIR-SHARED-SECRET': 'shared-secret',
        'X-EPIR-CHANNEL': 'hydrogen-zareczyny',
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('missing X-EPIR-STOREFRONT-ID');
  });

  it('rejects request without channel header even if body provides channel', async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(
      makeChatRequest({
        'X-EPIR-SHARED-SECRET': 'shared-secret',
        'X-EPIR-STOREFRONT-ID': 'zareczyny',
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('missing X-EPIR-CHANNEL');
  });

  it('accepts valid S2S contract and persists header context over body context', async () => {
    const { env, sessions } = makeEnv();
    const response = await worker.fetch(
      makeChatRequest({
        'X-EPIR-SHARED-SECRET': 'shared-secret',
        'X-EPIR-STOREFRONT-ID': 'zareczyny',
        'X-EPIR-CHANNEL': 'hydrogen-zareczyny',
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { reply?: string; session_id?: string };
    expect(payload.reply).toContain('Witaj');
    expect(payload.session_id).toBeTruthy();

    const session = sessions.get(String(payload.session_id));
    expect(session?.storage.get('storefront_id')).toBe('zareczyny');
    expect(session?.storage.get('channel')).toBe('hydrogen-zareczyny');
  });
});

describe('parseChatRequestBody', () => {
  it('prefers context override over storefront and channel from body', () => {
    const payload = parseChatRequestBody(
      {
        message: 'hej',
        storefrontId: 'body-storefront',
        channel: 'body-channel',
      },
      null,
      {
        storefrontId: 'zareczyny',
        channel: 'hydrogen-zareczyny',
      },
    );

    expect(payload).not.toBeNull();
    expect(payload?.storefrontId).toBe('zareczyny');
    expect(payload?.channel).toBe('hydrogen-zareczyny');
  });
});