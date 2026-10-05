import { describe, expect, it } from 'vitest';
import worker, { SessionDO, buildSessionDOShardName, parseChatRequestBody } from '../src/index';
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
    RATE_LIMITER_DO: makeRateLimiterNamespace(),
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

  it('uses operator greeting for operator channel', async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(
      makeChatRequest(
        {
          'X-EPIR-SHARED-SECRET': 'shared-secret',
          'X-EPIR-STOREFRONT-ID': 'operator',
          'X-EPIR-CHANNEL': 'operator',
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
    expect(payload.reply).toContain('analityczno-doradczym');
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
        channel: 'operator',
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

  it('parses customer hint fields from body (opaque payload; not verified identity)', () => {
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

  it('normalizes whitespace-only session_id to undefined', () => {
    const payload = parseChatRequestBody({
      message: 'hej',
      session_id: '   \t  ',
    });

    expect(payload).not.toBeNull();
    expect(payload?.session_id).toBeUndefined();
  });

  it('uses fallback shard when session_id is blank after trim', () => {
    expect(buildSessionDOShardName('   ')).toBe('session:v1:fallback');
  });

  it('passes a _shopify_y value and a minted uuid through to SessionDO unchanged', () => {
    const shopifyY = '8f3c1a20-6b14-4e2a-9c77-0a1b2c3d4e5f';
    const mintedUuid = '4017ca9b-8f55-45a9-ad7e-b94dc2505056';
    expect(buildSessionDOShardName(shopifyY)).toBe(shopifyY);
    expect(buildSessionDOShardName(mintedUuid)).toBe(mintedUuid);
  });
});

describe('App Proxy customer_id_hint in body', () => {
  it('accepts signed /chat when logged_in_customer_id empty; hint does not establish Shopify customer id', async () => {
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

describe('brand-locked greeting', () => {
  it('answers cześć on the EPIR shop in the EPIR voice even when the body says Kazka and stream is on', async () => {
    const {env, sessions} = makeEnv();
    const nowTs = Math.floor(Date.now() / 1000);
    const request = await makeSignedAppProxyRequest(
      `https://asystent.epirbizuteria.pl/chat?shop=epir-art-silver-jewellery.myshopify.com&timestamp=${nowTs}`,
      {
        message: 'cześć',
        stream: true,
        brand: 'kazka',
        storefrontId: 'kazka',
        channel: 'hydrogen-kazka',
        session_id: 'phone-session',
        page_host: 'epirbizuteria.pl',
        path: '/collections/zlota-bizuteria',
      },
    );
    request.headers.set('Referer', 'https://epirbizuteria.pl/collections/zlota-bizuteria');

    const response = await worker.fetch(request, env, noopCtx);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {reply?: string; session_id?: string};
    expect(payload.session_id).toBe('phone-session');
    expect(payload.reply).toContain('EPIR Art Jewellery');
    expect(payload.reply).not.toContain('Kazka Jewelry');
    expect(buildSessionDOShardName('phone-session')).toBe('phone-session');
    expect(sessions.get('phone-session')).toBeTruthy();
    expect(sessions.get('epir:phone-session')).toBeUndefined();
    expect(sessions.get('kazka:phone-session')).toBeUndefined();
  });

  it('does not continue a Kazka greeting when the same session id later hits EPIR', async () => {
    const {env, sessions} = makeEnv();
    const shared = 'shared-across-brands';
    const kazkaResponse = await worker.fetch(
      makeChatRequest(
        {
          'X-EPIR-SHARED-SECRET': 'shared-secret',
          'X-EPIR-STOREFRONT-ID': 'kazka',
          'X-EPIR-CHANNEL': 'hydrogen-kazka',
        },
        {message: 'hej', stream: false, session_id: shared, brand: 'kazka'},
      ),
      env,
      noopCtx,
    );
    const kazkaPayload = (await kazkaResponse.json()) as {reply?: string};
    expect(kazkaPayload.reply).toContain('Kazka Jewelry');

    const nowTs = Math.floor(Date.now() / 1000);
    const epirResponse = await worker.fetch(
      await makeSignedAppProxyRequest(
        `https://asystent.epirbizuteria.pl/chat?shop=epir-art-silver-jewellery.myshopify.com&timestamp=${nowTs}`,
        {message: 'hej', stream: false, session_id: shared, brand: 'kazka', page_host: 'epirbizuteria.pl'},
      ),
      env,
      noopCtx,
    );
    const epirPayload = (await epirResponse.json()) as {reply?: string};
    expect(epirPayload.reply).toContain('EPIR Art Jewellery');
    expect(epirPayload.reply).not.toContain('Kazka Jewelry');

    const history = await worker.fetch(
      await makeSignedAppProxyHistoryRequest(shared),
      env,
      noopCtx,
    );
    const historyPayload = (await history.json()) as {history: Array<{content: string}>};
    expect(historyPayload.history.map((entry) => entry.content).join('\n')).not.toContain('Kazka Jewelry');
    expect(historyPayload.history.map((entry) => entry.content).join('\n')).toContain('EPIR Art Jewellery');
    expect(sessions.get(shared)).toBeTruthy();
    expect(sessions.get(`epir:${shared}`)).toBeUndefined();
    expect(sessions.get(`kazka:${shared}`)).toBeUndefined();
  });
});

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
    body: JSON.stringify({session_id: sessionId, page_host: 'epirbizuteria.pl', brand: 'kazka'}),
  });
}

describe('SessionDO lifecycle after the auxiliary rate window', () => {
  const shopifyY = '8f3c1a20-6b14-4e2a-9c77-0a1b2c3d4e5f';

  it('still stores an assistant reply when the non-chat 20/min window is already full', async () => {
    const {env, sessions} = makeEnv();
    const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(shopifyY));
    for (let i = 0; i < 20; i++) {
      const view = await stub.fetch('https://session/track-product-view', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({product_id: `gid://shopify/Product/${i}`}),
      });
      expect(view.status).toBe(200);
    }

    const response = await worker.fetch(
      makeChatRequest(
        {
          'X-EPIR-SHARED-SECRET': 'shared-secret',
          'X-EPIR-STOREFRONT-ID': 'online-store',
          'X-EPIR-CHANNEL': 'online-store',
        },
        {
          message: 'hej',
          stream: false,
          session_id: shopifyY,
          brand: 'epir',
        },
      ),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {reply?: string; session_id?: string; error?: string};
    expect(payload.error).toBeUndefined();
    expect(payload.session_id).toBe(shopifyY);
    expect(payload.reply).toContain('EPIR Art Jewellery');
    expect(payload.reply).not.toContain('Kazka');
    expect(sessions.has(shopifyY)).toBe(true);

    const historyResponse = await stub.fetch('https://session/history');
    const history = (await historyResponse.json()) as Array<{role: string; content: string}>;
    expect(history.some((entry) => entry.role === 'assistant' && entry.content.includes('EPIR Art Jewellery'))).toBe(
      true,
    );
  });

  it('returns an explicit client reply when SessionDO append fails', async () => {
    const {env} = makeEnv({
      SESSION_DO: {
        idFromName(name: string) {
          return name;
        },
        get() {
          return {
            async fetch(input: RequestInfo | URL, init?: RequestInit) {
              const request =
                input instanceof Request
                  ? input
                  : new Request(new URL(String(input), 'https://session').toString(), init);
              if (new URL(request.url).pathname.endsWith('/append')) {
                return new Response('storage failed', {status: 500});
              }
              return new Response('ok');
            },
          } as DurableObjectStub;
        },
      } as unknown as DurableObjectNamespace,
    });

    const response = await worker.fetch(
      makeChatRequest(
        {
          'X-EPIR-SHARED-SECRET': 'shared-secret',
          'X-EPIR-STOREFRONT-ID': 'online-store',
          'X-EPIR-CHANNEL': 'online-store',
        },
        {
          message: 'hej',
          stream: false,
          session_id: shopifyY,
          brand: 'epir',
        },
      ),
      env,
      noopCtx,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {reply?: string; session_id?: string; error?: string};
    expect(payload.error).toBeUndefined();
    expect(payload.session_id).toBe(shopifyY);
    expect(payload.reply).toBe('Nie udało się zapisać tej wiadomości. Napisz proszę jeszcze raz za chwilę.');
  });
});