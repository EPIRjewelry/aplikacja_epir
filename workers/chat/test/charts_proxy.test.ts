import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/config/bindings';
import { computeHmac, shopifyAppProxyCanonicalString } from '../src/hmac';

const noopCtx = { waitUntil() {} } as unknown as ExecutionContext;

function makeNoopNamespace() {
  return {
    idFromName() {
      return 'noop';
    },
    get() {
      return { async fetch() { return new Response('ok'); } } as any;
    },
  } as unknown as DurableObjectNamespace;
}

function makeRateLimiterAllow() {
  return {
    idFromName() {
      return 'rl';
    },
    get() {
      return {
        async fetch() {
          return Response.json({ allowed: true, retryAfterMs: 0 });
        },
      } as any;
    },
  } as unknown as DurableObjectNamespace;
}

function makeRateLimiterDeny() {
  return {
    idFromName() {
      return 'rl';
    },
    get() {
      return {
        async fetch() {
          return Response.json({ allowed: false, retryAfterMs: 500 }, { status: 429 });
        },
      } as any;
    },
  } as unknown as DurableObjectNamespace;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SESSION_DO: makeNoopNamespace(),
    RATE_LIMITER_DO: makeRateLimiterAllow(),
    TOKEN_VAULT_DO: makeNoopNamespace(),
    DB: {} as D1Database,
    DB_CHATBOT: {} as D1Database,
    SHOPIFY_APP_SECRET: 'shopify-app-secret',
    EPIR_CHAT_SHARED_SECRET: 'shared-secret',
    ALLOWED_ORIGIN: 'https://epirbizuteria.pl',
    ALLOWED_ORIGINS: 'https://epirbizuteria.pl,https://zareczyny.epirbizuteria.pl',
    SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
    ...overrides,
  } as Env;
}

function sampleChartsRpcEnvelope(body: string) {
  return {
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'application/json',
      'x-d1-bookmark': 'bookmark-from-analytics',
    },
    body,
  };
}

async function signedChartsAppProxyUrl(extraSearch: Record<string, string> = {}) {
  const nowTs = Math.floor(Date.now() / 1000);
  const url = new URL('https://asystent.epirbizuteria.pl/apps/assistant/charts');
  url.searchParams.set('shop', 'epir-art-silver-jewellery.myshopify.com');
  url.searchParams.set('timestamp', String(nowTs));
  for (const [k, v] of Object.entries(extraSearch)) {
    url.searchParams.set(k, v);
  }
  const canonical = shopifyAppProxyCanonicalString(url.searchParams);
  const signature = await computeHmac('shopify-app-secret', canonical);
  url.searchParams.set('signature', signature);
  return url.toString();
}

describe('charts reverse proxy', () => {
  it('GET /apps/assistant/charts returns 401 without valid HMAC', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      new Request('https://asystent.epirbizuteria.pl/apps/assistant/charts?shop=x.myshopify.com&timestamp=1&signature=bad'),
      env,
      noopCtx,
    );
    expect(res.status).toBe(401);
  });

  it('GET /apps/assistant/charts invokes ANALYTICS_S2S_RPC after HMAC gate', async () => {
    const rpcCalls: Array<{ snapshot_date: string | null; bookmark: string | null }> = [];
    const env = makeEnv({
      ANALYTICS_S2S_RPC: {
        async getWarehouseCharts(snapshot_date?: string | null, d1Bookmark?: string | null) {
          rpcCalls.push({ snapshot_date: snapshot_date ?? null, bookmark: d1Bookmark ?? null });
          return Promise.resolve(sampleChartsRpcEnvelope(JSON.stringify({ version: 1 })));
        },
      } as unknown as Env['ANALYTICS_S2S_RPC'],
    });

    const res = await worker.fetch(
      new Request(await signedChartsAppProxyUrl({ snapshot_date: '2099-01-01' }), {
        method: 'GET',
        headers: { Authorization: 'Bearer client-should-not-leak' },
      }),
      env,
      noopCtx,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('x-d1-bookmark')).toBe('bookmark-from-analytics');
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]!.snapshot_date).toBe('2099-01-01');
  });

  it('GET /api/charts S2S requires shared secret and invokes RPC', async () => {
    const rpcHits: number[] = [];
    const env = makeEnv({
      ANALYTICS_S2S_RPC: {
        async getWarehouseCharts() {
          rpcHits.push(1);
          return Promise.resolve(sampleChartsRpcEnvelope('{}'));
        },
      } as unknown as Env['ANALYTICS_S2S_RPC'],
    });

    const res = await worker.fetch(
      new Request('https://asystent.epirbizuteria.pl/api/charts?snapshot_date=2099-02-02', {
        method: 'GET',
        headers: {
          'X-EPIR-SHARED-SECRET': 'shared-secret',
          'X-EPIR-STOREFRONT-ID': 'kazka',
          'X-EPIR-CHANNEL': 'hydrogen-kazka',
        },
      }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(200);
    expect(rpcHits).toHaveLength(1);
  });

  it('GET /api/charts returns 401 without S2S secret', async () => {
    const env = makeEnv({
      ANALYTICS_S2S_RPC: {
        getWarehouseCharts: () => Promise.reject(new Error('should not reach')),
      } as Env['ANALYTICS_S2S_RPC'],
    });
    const res = await worker.fetch(
      new Request('https://asystent.epirbizuteria.pl/api/charts', {
        method: 'GET',
        headers: {
          'X-EPIR-STOREFRONT-ID': 'kazka',
          'X-EPIR-CHANNEL': 'hydrogen-kazka',
        },
      }),
      env,
      noopCtx,
    );
    expect(res.status).toBe(401);
  });

  it('returns 429 when RateLimiterDO denies (DoW guard)', async () => {
    const env = makeEnv({
      RATE_LIMITER_DO: makeRateLimiterDeny(),
      ANALYTICS_S2S_RPC: {
        getWarehouseCharts: () => Promise.reject(new Error('should not reach analytics RPC')),
      } as Env['ANALYTICS_S2S_RPC'],
    });
    const res = await worker.fetch(new Request(await signedChartsAppProxyUrl(), { method: 'GET' }), env, noopCtx);
    expect(res.status).toBe(429);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe('rate_limited');
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });
});
