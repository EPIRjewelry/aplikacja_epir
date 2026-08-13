import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { shopifyAppProxyCanonicalString } from '../src/hmac';
import worker, { SessionDO } from '../src/index';
import type { Env } from '../src/config/bindings';
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
          return new Response(JSON.stringify({ allowed: true, tokens: 10 }), {
            headers: { 'Content-Type': 'application/json' },
          });
        },
      } as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function makeSessionNamespace() {
  const sessions = new Map<string, { storage: Map<string, unknown>; instance: SessionDO }>();
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
            instance: new SessionDO(durableState.state, {} as Env),
          };
          sessions.set(key, session);
        }
        return {
          fetch(input: RequestInfo | URL, init?: RequestInit) {
            const request =
              input instanceof Request
                ? input
                : new Request(typeof input === 'string' && input.startsWith('/') ? `https://session${input}` : input, init);
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

function makeR2Mock() {
  const objects = new Map<string, Uint8Array>();
  return {
    bucket: {
      async put(key: string, value: Uint8Array) {
        objects.set(key, value);
      },
    } as unknown as R2Bucket,
    objects,
  };
}

function makeEnv(overrides: Partial<Env> = {}) {
  const sessionNamespace = makeSessionNamespace();
  const { db, inserts } = makeD1Capture();
  const r2 = makeR2Mock();

  const env = {
    SHOPIFY_APP_SECRET: 'test-secret',
    ALLOWED_ORIGIN: 'https://epirbizuteria.pl',
    ALLOWED_ORIGINS: 'https://epirbizuteria.pl',
    SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
    SESSION_DO: sessionNamespace.namespace,
    RATE_LIMITER_DO: makeNoopNamespace(),
    TOKEN_VAULT_DO: makeNoopNamespace(),
    DB_CHATBOT: db,
    COCREATE_UPLOADS: r2.bucket,
    COCREATE_NOTIFY_EMAIL: 'studio@test.local',
    COCREATE_FROM_EMAIL: 'brief@test.local',
    RESEND_API_KEY: 're_test_key',
    ...overrides,
  } as Env;

  return { env, inserts, r2 };
}

function signedCocreateRequest(secret: string, body: FormData): Request {
  const params = new URLSearchParams({
    shop: 'epir-art-silver-jewellery.myshopify.com',
    timestamp: String(Math.floor(Date.now() / 1000)),
    path_prefix: '/apps/assistant',
  });
  const canonical = shopifyAppProxyCanonicalString(params);
  params.set('signature', signHex(secret, canonical));

  const url = new URL('https://asystent.epirbizuteria.pl/apps/assistant/cocreate');
  url.search = params.toString();

  return new Request(url.toString(), { method: 'POST', body });
}

describe('App Proxy ingress POST /apps/assistant/cocreate', () => {
  it('rejects missing HMAC signature', async () => {
    const { env } = makeEnv();
    const form = new FormData();
    form.set('name', 'Anna');
    form.set('email', 'anna@example.com');
    form.set('vision', 'Pierścionek z szafirem');
    form.set('consent_project', '1');

    const res = await worker.fetch(
      new Request('https://asystent.epirbizuteria.pl/apps/assistant/cocreate', { method: 'POST', body: form }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(401);
  });

  it('accepts valid brief without attachment', async () => {
    const { env, inserts } = makeEnv();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('resend.com')) {
        return new Response('{"id":"msg_1"}', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }));

    const form = new FormData();
    form.set('name', 'Anna');
    form.set('email', 'anna@example.com');
    form.set('vision', 'Pierścionek z szafirem');
    form.set('jewelry_type', 'pierścionek');
    form.set('budget_band', '5-15k');
    form.set('consent_project', '1');

    const res = await worker.fetch(signedCocreateRequest('test-secret', form), env, noopCtx);
    expect(res.status).toBe(201);
    const json = await res.json() as { ok: boolean; referenceId: string };
    expect(json.ok).toBe(true);
    expect(json.referenceId).toMatch(/^EPIR-\d{4}-[A-F0-9]{8}$/);
    expect(inserts.length).toBe(1);
    expect(inserts[0].sql).toContain('INSERT INTO cocreate_briefs');

    vi.unstubAllGlobals();
  });

  it('accepts valid brief on App Proxy stripped path /cocreate', async () => {
    const { env, inserts } = makeEnv();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('resend.com')) {
        return new Response('{"id":"msg_1"}', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }));

    const form = new FormData();
    form.set('name', 'Anna');
    form.set('email', 'anna@example.com');
    form.set('vision', 'Pierścionek z szafirem');
    form.set('consent_project', '1');

    const params = new URLSearchParams({
      shop: 'epir-art-silver-jewellery.myshopify.com',
      timestamp: String(Math.floor(Date.now() / 1000)),
      path_prefix: '/apps/assistant',
    });
    const canonical = shopifyAppProxyCanonicalString(params);
    params.set('signature', signHex('test-secret', canonical));

    const url = new URL('https://asystent.epirbizuteria.pl/cocreate');
    url.search = params.toString();

    const res = await worker.fetch(new Request(url.toString(), { method: 'POST', body: form }), env, noopCtx);
    expect(res.status).toBe(201);
    expect(inserts.length).toBe(1);

    vi.unstubAllGlobals();
  });

  it('rejects brief without project consent', async () => {
    const { env } = makeEnv();
    const form = new FormData();
    form.set('name', 'Anna');
    form.set('email', 'anna@example.com');
    form.set('vision', 'Test');

    const res = await worker.fetch(signedCocreateRequest('test-secret', form), env, noopCtx);
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('validation_failed');
  });

  it('accepts brief with base64 attachment (App Proxy-safe transport)', async () => {
    const { env, inserts, r2 } = makeEnv();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('resend.com')) {
        return new Response('{"id":"msg_1"}', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }));

    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const form = new FormData();
    form.set('name', 'Anna');
    form.set('email', 'anna@example.com');
    form.set('vision', 'Pierścionek z szafirem');
    form.set('consent_project', '1');
    form.set('attachment_base64', Buffer.from(jpegBytes).toString('base64'));
    form.set('attachment_filename', 'szkic.jpg');

    const res = await worker.fetch(signedCocreateRequest('test-secret', form), env, noopCtx);
    expect(res.status).toBe(201);
    expect(inserts.length).toBe(1);
    expect(inserts[0].args[13]).toMatch(/^online-store\/\d{4}\/\d{2}\/EPIR-\d{4}-[A-F0-9]{8}\/szkic\.jpg$/);
    expect(r2.objects.size).toBe(1);

    vi.unstubAllGlobals();
  });
});
