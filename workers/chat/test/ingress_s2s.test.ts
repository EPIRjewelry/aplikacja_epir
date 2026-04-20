import { describe, expect, it } from 'vitest';
import worker, { SessionDO, parseChatRequestBody } from '../src/index';
import type { Env } from '../src/config/bindings';
import { computeHmac, shopifyAppProxyCanonicalString } from '../src/hmac';
import { makeDurableStateStub } from './helpers/session-do-sql-stub';

const noopCtx = { waitUntil() {} } as unknown as ExecutionContext;

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

  return { env, sessions: sessionNamespace.sessions };
}

function makeChatRequest(
  headers: HeadersInit = {},
  body?: Record<string, unknown>,
  url = 'https://asystent.epirbizuteria.pl/chat',
) {
  return new Request(url, {
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

async function makeSignedAppProxyRequest(url: string, body: Record<string, unknown>) {
  const parsed = new URL(url);
  const canonical = shopifyAppProxyCanonicalString(parsed.searchParams);
  const signature = await computeHmac('shopify-app-secret', canonical);
  parsed.searchParams.set('signature', signature);

  return makeChatRequest(
    {
      accept: 'application/json, text/event-stream',
    },
    body,
    parsed.toString(),
  );
}

async function makeSignedJsonRequest(url: string, body: unknown) {
  const parsed = new URL(url);
  const canonical = shopifyAppProxyCanonicalString(parsed.searchParams);
  const signature = await computeHmac('shopify-app-secret', canonical);
  parsed.searchParams.set('signature', signature);

  return new Request(parsed.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
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

  it('routes signed /chat requests through App Proxy auth (without requiring S2S secret)', async () => {
    const { env } = makeEnv();
    const nowTs = Math.floor(Date.now() / 1000);
    const response = await worker.fetch(
      makeChatRequest(
        {},
        undefined,
        `https://asystent.epirbizuteria.pl/chat?shop=epir-art-silver-jewellery.myshopify.com&timestamp=${nowTs}&signature=dummy-signature`,
      ),
      env,
      noopCtx,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain('Invalid HMAC signature');
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

  it('uses Dev-asystent greeting for internal-dashboard channel', async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(
      makeChatRequest(
        {
          'X-EPIR-SHARED-SECRET': 'shared-secret',
          'X-EPIR-STOREFRONT-ID': 'online-store',
          'X-EPIR-CHANNEL': 'internal-dashboard',
        },
        {
          message: 'hej',
          stream: false,
          storefrontId: 'body-storefront',
          channel: 'body-channel',
          brand: 'epir',
        },
      ),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { reply?: string; session_id?: string };
    expect(payload.reply).toContain('Dev-asystent EPIR');
    expect(payload.session_id).toBeTruthy();
  });

  it('forces online-store context for signed App Proxy requests even if body tampers channel and brand', async () => {
    const { env, sessions } = makeEnv();
    const nowTs = Math.floor(Date.now() / 1000);
    const request = await makeSignedAppProxyRequest(
      `https://asystent.epirbizuteria.pl/chat?shop=epir-art-silver-jewellery.myshopify.com&timestamp=${nowTs}`,
      {
        message: 'hej',
        stream: false,
        storefrontId: 'body-storefront',
        channel: 'internal-dashboard',
        brand: 'kazka',
      },
    );

    const response = await worker.fetch(request, env, noopCtx);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { reply?: string; session_id?: string };
    expect(payload.reply).toContain('Jestem Gemma');
    expect(payload.reply).not.toContain('Dev-asystent');
    expect(payload.reply).not.toContain('Kazka Jewelry');

    const session = sessions.get(String(payload.session_id));
    expect(session?.storage.get('storefront_id')).toBe('online-store');
    expect(session?.storage.get('channel')).toBe('online-store');
  });

  it('accepts signed App Proxy MCP tools/list with the same canonical verifier', async () => {
    const { env } = makeEnv();
    const nowTs = Math.floor(Date.now() / 1000);
    const request = await makeSignedJsonRequest(
      `https://asystent.epirbizuteria.pl/apps/assistant/mcp?shop=epir-art-silver-jewellery.myshopify.com&timestamp=${nowTs}`,
      {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      },
    );

    const response = await worker.fetch(request, env, noopCtx);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { result?: { tools?: unknown[] } };
    expect(Array.isArray(payload.result?.tools)).toBe(true);
    expect(payload.result?.tools?.length).toBeGreaterThan(0);
  });

  it('rejects invalid App Proxy signature for /apps/assistant/mcp', async () => {
    const { env } = makeEnv();
    const nowTs = Math.floor(Date.now() / 1000);
    const request = new Request(
      `https://asystent.epirbizuteria.pl/apps/assistant/mcp?shop=epir-art-silver-jewellery.myshopify.com&timestamp=${nowTs}&signature=bad-signature`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      },
    );

    const response = await worker.fetch(request, env, noopCtx);

    expect(response.status).toBe(401);
    expect(await response.text()).toContain('Invalid HMAC signature');
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

  it('infers storefront and channel from brand when body does not provide storefront context', () => {
    const payload = parseChatRequestBody({
      message: 'hej',
      brand: 'online-store',
    });

    expect(payload).not.toBeNull();
    expect(payload?.storefrontId).toBe('online-store');
    expect(payload?.channel).toBe('online-store');
  });

  it('parses customer hint fields from body (used when App Proxy URL id is empty)', () => {
    const payload = parseChatRequestBody({
      message: 'hej',
      customer_id_hint: 'gid://shopify/Customer/123',
      customer_id_hint_source: 'shopify-analytics',
    });

    expect(payload).not.toBeNull();
    expect(payload?.customer_id_hint).toBe('gid://shopify/Customer/123');
    expect(payload?.customer_id_hint_source).toBe('shopify-analytics');
  });

  it('parses path from body', () => {
    const payload = parseChatRequestBody({
      message: 'hej',
      path: '/collections/galazki',
    });

    expect(payload).not.toBeNull();
    expect(payload?.path).toBe('/collections/galazki');
  });
});

describe('App Proxy customer_id_hint promotion', () => {
  it('accepts signed /chat when logged_in_customer_id empty but body hint is valid numeric id', async () => {
    const { env } = makeEnv();
    const nowTs = Math.floor(Date.now() / 1000);
    // Krótkie powitanie + stream:false → JSON (jak inne testy S2S/App Proxy), nie SSE.
    const request = await makeSignedAppProxyRequest(
      `https://asystent.epirbizuteria.pl/chat?shop=epir-art-silver-jewellery.myshopify.com&timestamp=${nowTs}`,
      {
        message: 'hej',
        stream: false,
        customer_id_hint: '1848062312553',
        customer_id_hint_source: 'dataset',
      },
    );

    const response = await worker.fetch(request, env, noopCtx);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { reply?: string; session_id?: string };
    expect(payload.session_id).toBeTruthy();
    expect(payload.reply).toBeTruthy();
  });
});