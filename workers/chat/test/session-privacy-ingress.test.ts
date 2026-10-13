import {describe, expect, it} from 'vitest';
import worker, {SessionDO} from '../src/index';
import type {Env} from '../src/config/bindings';
import {computeHmac, shopifyAppProxyCanonicalString} from '../src/hmac';
import {makeDurableStateStub} from './helpers/session-do-sql-stub';

const noopCtx = {waitUntil() {}} as unknown as ExecutionContext;
const KNOWN_SID = 'sess_privacy-known-0001';
const UNKNOWN_SID = 'sess_privacy-unknown-9999';

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

function makeD1SessionsStore() {
  const rows = new Map<string, {analytics_consent: number | null}>();
  const writes: Array<{sql: string; args: unknown[]}> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              writes.push({sql, args});
              if (sql.includes('INSERT INTO sessions')) {
                const sessionId = String(args[0] ?? '');
                if (sessionId) {
                  const consent = args[14];
                  rows.set(sessionId, {
                    analytics_consent:
                      consent === null || consent === undefined
                        ? null
                        : Number(consent),
                  });
                }
              }
              if (sql.includes('ON CONFLICT(session_id) DO UPDATE')) {
                const sessionId = String(args[0] ?? '');
                const consent = args[14];
                if (sessionId) {
                  const prev = rows.get(sessionId)?.analytics_consent ?? null;
                  rows.set(sessionId, {
                    analytics_consent:
                      consent === null || consent === undefined ? prev : Number(consent),
                  });
                }
              }
              return {success: true, meta: {}};
            },
            async first<T>() {
              if (sql.includes('SELECT session_id FROM sessions')) {
                const sessionId = String(args[0] ?? '');
                return rows.has(sessionId) ? ({session_id: sessionId} as T) : null;
              }
              return null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return {db, writes, rows};
}

function makeSessionNamespace(db: D1Database) {
  const sessions = new Map<string, SessionDO>();
  return {
    namespace: {
      idFromName(name: string) {
        return name;
      },
      get(id: string) {
        const key = String(id);
        let instance = sessions.get(key);
        if (!instance) {
          const {state} = makeDurableStateStub(key);
          instance = new SessionDO(state, {DB_CHATBOT: db} as Env);
          sessions.set(key, instance);
        }
        return {
          fetch(input: RequestInfo | URL, init?: RequestInit) {
            const request =
              input instanceof Request
                ? input
                : new Request(new URL(String(input), 'https://session').toString(), init);
            return instance!.fetch(request);
          },
        } as DurableObjectStub;
      },
    } as unknown as DurableObjectNamespace,
  };
}

function makeEnv() {
  const {db, writes, rows} = makeD1SessionsStore();
  const {namespace} = makeSessionNamespace(db);
  const env: Env = {
    SESSION_DO: namespace,
    RATE_LIMITER_DO: makeNoopNamespace(),
    TOKEN_VAULT_DO: makeNoopNamespace(),
    DB: {} as D1Database,
    DB_CHATBOT: db,
    SHOPIFY_APP_SECRET: 'shopify-app-secret',
    EPIR_CHAT_SHARED_SECRET: 'shared-secret',
    ALLOWED_ORIGIN: 'https://epirbizuteria.pl',
    ALLOWED_ORIGINS: 'https://epirbizuteria.pl',
    SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
  };
  return {env, writes, rows};
}

async function seedKnownSession(env: Env, sessionId: string) {
  const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId));
  await stub.fetch(
    new Request('https://session/set-session-id', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({session_id: sessionId}),
    }),
  );
  await stub.fetch(
    new Request('https://session/set-storefront-context', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({storefront_id: 'epir-liquid', channel: 'online-store'}),
    }),
  );
}

async function signedAppProxyPrivacyRequest(
  sessionId: string,
  body: Record<string, unknown>,
) {
  const nowTs = Math.floor(Date.now() / 1000);
  const url = new URL(
    `https://asystent.epirbizuteria.pl/apps/assistant/session-privacy?shop=epir-art-silver-jewellery.myshopify.com&timestamp=${nowTs}`,
  );
  const canonical = shopifyAppProxyCanonicalString(url.searchParams);
  const signature = await computeHmac('shopify-app-secret', canonical);
  url.searchParams.set('signature', signature);

  return new Request(url.toString(), {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({session_id: sessionId, ...body}),
  });
}

function s2sPrivacyRequest(sessionId: string, body: Record<string, unknown>) {
  return new Request('https://asystent.epirbizuteria.pl/session-privacy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-EPIR-SHARED-SECRET': 'shared-secret',
      'X-EPIR-STOREFRONT-ID': 'kazka',
      'X-EPIR-CHANNEL': 'hydrogen-kazka',
    },
    body: JSON.stringify({session_id: sessionId, ...body}),
  });
}

describe('session-privacy ingress', () => {
  it('rejects App Proxy session-privacy without valid signature', async () => {
    const {env} = makeEnv();
    const nowTs = Math.floor(Date.now() / 1000);
    const response = await worker.fetch(
      new Request(
        `https://asystent.epirbizuteria.pl/apps/assistant/session-privacy?shop=epir-art-silver-jewellery.myshopify.com&timestamp=${nowTs}&signature=bad`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({session_id: KNOWN_SID, analytics_consent: false}),
        },
      ),
      env,
      noopCtx,
    );
    expect(response.status).toBe(401);
  });

  it('returns 204 for unknown session_id without writing D1', async () => {
    const {env, writes, rows} = makeEnv();
    const response = await worker.fetch(
      await signedAppProxyPrivacyRequest(UNKNOWN_SID, {analytics_consent: false}),
      env,
      noopCtx,
    );
    expect(response.status).toBe(204);
    expect(rows.has(UNKNOWN_SID)).toBe(false);
    expect(writes.filter((w) => w.sql.includes('INSERT INTO sessions'))).toHaveLength(0);
  });

  it('App Proxy: analytics_consent true then false updates D1 for known session', async () => {
    const {env, rows} = makeEnv();
    await seedKnownSession(env, KNOWN_SID);

    const grant = await worker.fetch(
      await signedAppProxyPrivacyRequest(KNOWN_SID, {
        analytics_consent: true,
        session_id_source: 'session_storage',
      }),
      env,
      noopCtx,
    );
    expect(grant.status).toBe(204);
    expect(rows.get(KNOWN_SID)?.analytics_consent).toBe(1);

    const revoke = await worker.fetch(
      await signedAppProxyPrivacyRequest(KNOWN_SID, {analytics_consent: false}),
      env,
      noopCtx,
    );
    expect(revoke.status).toBe(204);
    expect(rows.get(KNOWN_SID)?.analytics_consent).toBe(0);
  });

  it('accepts stripped App Proxy path /session-privacy with query signature', async () => {
    const {env, rows} = makeEnv();
    await seedKnownSession(env, KNOWN_SID);
    const nowTs = Math.floor(Date.now() / 1000);
    const url = new URL(
      `https://asystent.epirbizuteria.pl/session-privacy?shop=epir-art-silver-jewellery.myshopify.com&timestamp=${nowTs}`,
    );
    const canonical = shopifyAppProxyCanonicalString(url.searchParams);
    const signature = await computeHmac('shopify-app-secret', canonical);
    url.searchParams.set('signature', signature);

    const response = await worker.fetch(
      new Request(url.toString(), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({session_id: KNOWN_SID, analytics_consent: false}),
      }),
      env,
      noopCtx,
    );
    expect(response.status).toBe(204);
    expect(rows.get(KNOWN_SID)?.analytics_consent).toBe(0);
  });

  it('S2S /session-privacy mirrors Hydrogen BFF auth', async () => {
    const {env, rows} = makeEnv();
    await seedKnownSession(env, KNOWN_SID);

    const response = await worker.fetch(
      s2sPrivacyRequest(KNOWN_SID, {analytics_consent: true}),
      env,
      noopCtx,
    );
    expect(response.status).toBe(204);
    expect(rows.get(KNOWN_SID)?.analytics_consent).toBe(1);
  });

  it('omitted analytics_consent keeps previous D1 value (COALESCE)', async () => {
    const {env, rows} = makeEnv();
    await seedKnownSession(env, KNOWN_SID);

    await worker.fetch(
      await signedAppProxyPrivacyRequest(KNOWN_SID, {analytics_consent: true}),
      env,
      noopCtx,
    );
    await worker.fetch(
      await signedAppProxyPrivacyRequest(KNOWN_SID, {
        session_id_source: 'session_storage',
      }),
      env,
      noopCtx,
    );
    expect(rows.get(KNOWN_SID)?.analytics_consent).toBe(1);
  });
});
