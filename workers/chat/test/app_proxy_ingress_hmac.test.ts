import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import worker, { SessionDO } from '../src/index';
import type { Env } from '../src/config/bindings';

function canonicalizeParams(params: URLSearchParams): string {
  const excluded = new Set(['signature', 'hmac', 'shopify_hmac']);
  const entries = [...params.entries()]
    .filter(([key]) => !excluded.has(key))
    .sort((a, b) => a[0].localeCompare(b[0]));

  return entries.map(([key, value]) => `${key}=${value}`).join('');
}

function signHex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

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
            const request =
              input instanceof Request
                ? input
                : new Request(
                    typeof input === 'string' && input.startsWith('/')
                      ? `https://session${input}`
                      : input,
                    init,
                  );
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
    SHOPIFY_APP_SECRET: 'proxy-shared-secret',
    EPIR_CHAT_SHARED_SECRET: 'shared-secret',
    ALLOWED_ORIGIN: 'https://epirbizuteria.pl',
    ALLOWED_ORIGINS: 'https://epirbizuteria.pl,https://epir-art-silver-jewellery.myshopify.com',
    GROQ_API_KEY: 'test-groq-key',
    SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
    ...overrides,
  };

  return { env, sessions: sessionNamespace.sessions };
}

function buildBaseUrl() {
  const url = new URL('https://asystent.epirbizuteria.pl/apps/assistant/chat');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  url.searchParams.set('shop', 'epir-art-silver-jewellery.myshopify.com');
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('nonce', nonce);
  return url;
}

function payloadString() {
  return JSON.stringify({
    message: 'hej',
    stream: false,
    brand: 'zareczyny',
  });
}

function signRequest(url: URL, body: string, secret: string): string {
  const canonical = canonicalizeParams(url.searchParams);
  return signHex(secret, canonical + body);
}

describe('App Proxy ingress HMAC (/apps/assistant/chat)', () => {
  it('returns 401 when signature is missing', async () => {
    const { env } = makeEnv();
    const url = buildBaseUrl();
    const response = await worker.fetch(
      new Request(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadString(),
      }),
      env,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain('Unauthorized');
  });

  it('returns 401/403 when signature is invalid', async () => {
    const { env } = makeEnv();
    const url = buildBaseUrl();
    const body = payloadString();
    const badSignature = signRequest(url, body, 'wrong-shared-secret');

    const response = await worker.fetch(
      new Request(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-shopify-hmac-sha256': badSignature,
        },
        body,
      }),
      env,
    );

    expect([401, 403]).toContain(response.status);
  });

  it('returns 200 for valid HMAC request', async () => {
    const { env } = makeEnv();
    const url = buildBaseUrl();
    const body = payloadString();
    const signature = signRequest(url, body, env.SHOPIFY_APP_SECRET);

    const response = await worker.fetch(
      new Request(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-shopify-hmac-sha256': signature,
        },
        body,
      }),
      env,
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as { reply?: string; session_id?: string };
    expect(data.reply).toContain('Witaj');
    expect(data.session_id).toBeTruthy();
  });
});