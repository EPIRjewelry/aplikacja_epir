import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { shopifyAppProxyCanonicalString } from '../src/hmac';
import worker from '../src/index';
import type { Env } from '../src/config/bindings';
import { SessionDO } from '../src/index';
import { makeDurableStateStub } from './helpers/session-do-sql-stub';

const noopCtx = { waitUntil() {} } as unknown as ExecutionContext;

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
          const durableState = makeDurableStateStub(key);
          session = {
            storage: durableState.storage,
            instance: new SessionDO(durableState.state, {} as any),
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
    SHOPIFY_APP_SECRET: 'proxy-shared-secret',
    EPIR_CHAT_SHARED_SECRET: 'shared-secret',
    ALLOWED_ORIGIN: 'https://epirbizuteria.pl',
    ALLOWED_ORIGINS: 'https://epirbizuteria.pl,https://epir-art-silver-jewellery.myshopify.com',
    SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
    ...overrides,
  };

  return { env, sessions: sessionNamespace.sessions, inserts };
}

function buildConsentUrl(extraQuery?: Record<string, string>) {
  const url = new URL('https://asystent.epirbizuteria.pl/apps/assistant/consent');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  url.searchParams.set('shop', 'epir-art-silver-jewellery.myshopify.com');
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('nonce', nonce);
  if (extraQuery) {
    for (const [k, v] of Object.entries(extraQuery)) {
      url.searchParams.set(k, v);
    }
  }
  return url;
}

function signRequest(url: URL, body: string, secret: string): string {
  const canonical = canonicalizeParams(url.searchParams);
  return signHex(secret, canonical + body);
}

function signShopifyAppProxyQuery(url: URL, secret: string): string {
  const canonical = shopifyAppProxyCanonicalString(url.searchParams);
  return signHex(secret, canonical);
}

function validConsentBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    consentId: 'consent-test-1',
    granted: true,
    source: 'widget',
    sessionId: 'sess-app-proxy',
    timestamp: 1_712_000_000_000,
    route: '/pages/test',
    anonymousId: 'anon-1',
    ...overrides,
  });
}

describe('App Proxy ingress POST /apps/assistant/consent', () => {
  it('returns 401 when HMAC signature is missing', async () => {
    const { env } = makeEnv();
    const url = buildConsentUrl();
    const response = await worker.fetch(
      new Request(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: validConsentBody(),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain('Unauthorized');
  });

  it('returns 204 and persists append-only row for valid header HMAC', async () => {
    const { env, inserts } = makeEnv();
    const url = buildConsentUrl();
    const body = validConsentBody();
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
      noopCtx,
    );

    expect(response.status).toBe(204);
    expect(inserts.length).toBe(1);
    expect(inserts[0].sql).toContain('INSERT INTO consent_events');
    const args = inserts[0].args;
    expect(args[0]).toBe('consent-test-1');
    expect(args[1]).toBe(1);
    expect(args[3]).toBe('online-store');
    expect(args[4]).toBe('online-store');
    expect(args[6]).toBe('/pages/test');
    expect(args[7]).toBe('sess-app-proxy');
    expect(args[8]).toBe('anon-1');
    expect(args[9]).toBeNull();
  });

  it('merges logged_in_customer_id from query into customer_id', async () => {
    const { env, inserts } = makeEnv();
    const url = buildConsentUrl({ logged_in_customer_id: '12345' });
    const body = validConsentBody();
    const signature = signShopifyAppProxyQuery(url, env.SHOPIFY_APP_SECRET);
    url.searchParams.set('signature', signature);

    const response = await worker.fetch(
      new Request(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(204);
    expect(inserts[0].args[9]).toBe('12345');
  });

  it('returns 400 when granted is not a boolean', async () => {
    const { env } = makeEnv();
    const url = buildConsentUrl();
    const body = validConsentBody({ granted: 'yes' as unknown as boolean });
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
      noopCtx,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('granted must be a boolean');
  });

  it('returns 400 when JSON is empty', async () => {
    const { env } = makeEnv();
    const url = buildConsentUrl();
    const body = '';
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
      noopCtx,
    );

    expect(response.status).toBe(400);
  });

  it('returns 500 when DB_CHATBOT is not configured', async () => {
    const { env: base } = makeEnv();
    const env = { ...base, DB_CHATBOT: undefined } as Env;
    const url = buildConsentUrl();
    const body = validConsentBody();
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
      noopCtx,
    );

    expect(response.status).toBe(500);
  });
});
