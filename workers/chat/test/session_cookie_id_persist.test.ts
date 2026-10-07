import { describe, expect, it } from 'vitest';
import worker, { SessionDO } from '../src/index';
import type { Env } from '../src/config/bindings';
import { makeDurableStateStub } from './helpers/session-do-sql-stub';
import { expectBuyerUnavailableJson } from './helpers/buyer-unavailable';

const noopCtx = { waitUntil() {} } as unknown as ExecutionContext;

/** Distinct from the browser cookie. Production `id.toString()` is 64 hex chars. */
const DO_HEX_ID = 'a'.repeat(64);
const COOKIE_SESSION_ID = 'e1df4a20-6b14-4e2a-9c77-0a1b2c3d4e5f';

function makeD1Capture() {
  const writes: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              writes.push({ sql, args });
              return { success: true, meta: {} };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, writes };
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
          return Response.json({ allowed: true, retryAfterMs: 0 });
        },
      } as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

/**
 * DO name is the cookie id (idFromName), but `state.id.toString()` is the internal hex.
 * That split is what made flow-health compare pixel session_id with the hex id.
 */
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
          const { state } = makeDurableStateStub(DO_HEX_ID);
          instance = new SessionDO(state, { DB_CHATBOT: db } as Env);
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
    sessions,
  };
}

function messageSessionIds(writes: Array<{ sql: string; args: unknown[] }>): unknown[] {
  return writes.filter((entry) => entry.sql.includes('INSERT INTO messages')).map((entry) => entry.args[0]);
}

describe('browser session_id persisted on chat messages', () => {
  it('etap 1: buyer chat does not persist messages (unavailable gate)', async () => {
    const { db, writes } = makeD1Capture();
    const { namespace } = makeSessionNamespace(db);
    const env = {
      SESSION_DO: namespace,
      RATE_LIMITER_DO: makeRateLimiterNamespace(),
      TOKEN_VAULT_DO: makeNoopNamespace(),
      DB: {} as D1Database,
      DB_CHATBOT: db,
      SHOPIFY_APP_SECRET: 'shopify-app-secret',
      EPIR_CHAT_SHARED_SECRET: 'shared-secret',
      ALLOWED_ORIGIN: 'https://epirbizuteria.pl',
      SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
    } as Env;

    const response = await worker.fetch(
      new Request('https://asystent.epirbizuteria.pl/chat', {
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
          session_id: COOKIE_SESSION_ID,
          brand: 'epir',
        }),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expectBuyerUnavailableJson(payload);
    expect(messageSessionIds(writes)).toHaveLength(0);
  });

  it('does not replace a stored browser session id with the Durable Object hex id', async () => {
    const { db, writes } = makeD1Capture();
    const { state } = makeDurableStateStub(DO_HEX_ID);
    const doStub = new SessionDO(state, { DB_CHATBOT: db } as Env);

    const setCookie = await doStub.fetch(
      new Request('https://session/set-session-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: COOKIE_SESSION_ID }),
      }),
    );
    expect(setCookie.ok).toBe(true);

    const setHex = await doStub.fetch(
      new Request('https://session/set-session-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: DO_HEX_ID }),
      }),
    );
    expect(setHex.ok).toBe(true);

    const append = await doStub.fetch(
      new Request('https://session/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: 'obraczka', ts: 1_710_000_000_000 }),
      }),
    );
    expect(append.ok).toBe(true);

    const stored = messageSessionIds(writes);
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.every((sessionId) => sessionId === COOKIE_SESSION_ID)).toBe(true);
  });
});
