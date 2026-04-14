import {describe, expect, it} from 'vitest';
import worker, {SessionDO} from '../src/index';
import type {Env} from '../src/config/bindings';
import {computeHmac, shopifyAppProxyCanonicalString} from '../src/hmac';
import {makeDurableStateStub} from './helpers/session-do-sql-stub';

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

function makeSessionNamespace() {
  const sessions = new Map<string, {storage: Map<string, unknown>; instance: SessionDO}>();

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
            instance: new SessionDO(durableState.state, {} as never),
          };
          sessions.set(key, session);
        }

        return {
          fetch(input: RequestInfo | URL, init?: RequestInit) {
            const request =
              input instanceof Request
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
    SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
    ...overrides,
  };
  return {env, sessions: sessionNamespace.sessions};
}

async function seedHistory(env: Env, sessionId: string) {
  const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId));
  await stub.fetch(
    new Request('https://session/set-session-id', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({session_id: sessionId}),
    }),
  );
  await stub.fetch(
    new Request('https://session/append', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({role: 'user', content: 'Cześć', ts: 1}),
    }),
  );
  await stub.fetch(
    new Request('https://session/append', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({role: 'assistant', content: 'Witaj!', ts: 2}),
    }),
  );
  await stub.fetch(
    new Request('https://session/append', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({role: 'tool', content: 'internal-only', ts: 3}),
    }),
  );
}

async function makeSignedAppProxyHistoryRequest(sessionId: string) {
  const nowTs = Math.floor(Date.now() / 1000);
  const url = new URL(
    `https://asystent.epirbizuteria.pl/apps/assistant/history?shop=epir-art-silver-jewellery.myshopify.com&timestamp=${nowTs}`,
  );
  const canonical = shopifyAppProxyCanonicalString(url.searchParams);
  const signature = await computeHmac('shopify-app-secret', canonical);
  url.searchParams.set('signature', signature);

  return new Request(url.toString(), {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({session_id: sessionId}),
  });
}

function makeS2SHistoryRequest(sessionId: string, headers: HeadersInit = {}) {
  return new Request('https://asystent.epirbizuteria.pl/history', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-EPIR-SHARED-SECRET': 'shared-secret',
      'X-EPIR-STOREFRONT-ID': 'kazka',
      'X-EPIR-CHANNEL': 'hydrogen-kazka',
      ...headers,
    },
    body: JSON.stringify({session_id: sessionId}),
  });
}

describe('history ingress', () => {
  it('returns sanitized history for signed App Proxy requests', async () => {
    const {env} = makeEnv();
    await seedHistory(env, 'session-app-proxy');

    const response = await worker.fetch(
      await makeSignedAppProxyHistoryRequest('session-app-proxy'),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      session_id: string;
      history: Array<{role: string; content: string}>;
    };
    expect(payload.session_id).toBe('session-app-proxy');
    expect(payload.history).toEqual([
      {role: 'user', content: 'Cześć'},
      {role: 'assistant', content: 'Witaj!'},
    ]);
  });

  it('returns sanitized history for valid S2S requests', async () => {
    const {env} = makeEnv();
    await seedHistory(env, 'session-s2s');

    const response = await worker.fetch(
      makeS2SHistoryRequest('session-s2s'),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      history: Array<{role: string; content: string}>;
    };
    expect(payload.history).toHaveLength(2);
    expect(payload.history[0]?.role).toBe('user');
    expect(payload.history[1]?.role).toBe('assistant');
  });

  it('rejects S2S history requests without shared secret', async () => {
    const {env} = makeEnv();
    const response = await worker.fetch(
      new Request('https://asystent.epirbizuteria.pl/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EPIR-STOREFRONT-ID': 'kazka',
          'X-EPIR-CHANNEL': 'hydrogen-kazka',
        },
        body: JSON.stringify({session_id: 'session-missing-secret'}),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain('missing X-EPIR-SHARED-SECRET');
  });

  it('rejects invalid App Proxy signature for storefront history ingress', async () => {
    const {env} = makeEnv();
    const nowTs = Math.floor(Date.now() / 1000);
    const response = await worker.fetch(
      new Request(
        `https://asystent.epirbizuteria.pl/apps/assistant/history?shop=epir-art-silver-jewellery.myshopify.com&timestamp=${nowTs}&signature=bad-signature`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({session_id: 'session-invalid-signature'}),
        },
      ),
      env,
      noopCtx,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain('Invalid HMAC signature');
  });

  it('rejects history requests without session_id', async () => {
    const {env} = makeEnv();
    const response = await worker.fetch(
      new Request('https://asystent.epirbizuteria.pl/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EPIR-SHARED-SECRET': 'shared-secret',
          'X-EPIR-STOREFRONT-ID': 'kazka',
          'X-EPIR-CHANNEL': 'hydrogen-kazka',
        },
        body: JSON.stringify({}),
      }),
      env,
      noopCtx,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('session_id required');
  });
});

