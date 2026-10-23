import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {createIntegrationFetchStub} from './helpers/integration-fetch-stub';
import {
  invokeOnRequest,
  loadBuiltOnRequest,
  makeTestEnv,
  type ZareczynyOnRequest,
} from './helpers/pages-event-context';

const ORIGIN = 'https://zareczyny.epirbizuteria.pl';
let onRequest: ZareczynyOnRequest;

beforeAll(async () => {
  onRequest = await loadBuiltOnRequest();
}, 120_000);

beforeEach(() => {
  const env = makeTestEnv();
  vi.stubGlobal(
    'fetch',
    createIntegrationFetchStub({
      shopDomain: env.PUBLIC_STORE_DOMAIN,
      apiVersion: env.PUBLIC_STOREFRONT_API_VERSION || '2025-10',
      shopId: env.SHOP_ID!,
      getAuthorizeNonce: () => 'unused',
    }),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('T-ENV-B1 NoopSession without SESSION_SECRET', () => {
  const envNoSecret = makeTestEnv({SESSION_SECRET: ''});

  it('GET / with forged session cookie → 200, no Set-Cookie', async () => {
    const res = await invokeOnRequest(
      onRequest,
      new Request(`${ORIGIN}/`, {
        headers: {Cookie: 'session=forged'},
      }),
      envNoSecret,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('POST /cart ADD_TO_CART → 200 without Set-Cookie', async () => {
    const form = new FormData();
    form.set('cartAction', 'ADD_TO_CART');
    form.set('lines', JSON.stringify([{merchandiseId: 'gid://shopify/ProductVariant/1', quantity: 1}]));
    const res = await invokeOnRequest(
      onRequest,
      new Request(`${ORIGIN}/cart`, {method: 'POST', body: form}),
      envNoSecret,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });
});

describe('T-ENV-B2 auth routes 503', () => {
  const envNoSecret = makeTestEnv({SESSION_SECRET: ''});

  it('GET account routes and POST logout → 503; GET / → 200', async () => {
    for (const path of ['/account/login', '/account/authorize', '/account/logout']) {
      const res = await invokeOnRequest(
        onRequest,
        new Request(`${ORIGIN}${path}`, {method: 'GET'}),
        envNoSecret,
      );
      expect(res.status).toBe(503);
    }
    const postLogout = await invokeOnRequest(
      onRequest,
      new Request(`${ORIGIN}/account/logout`, {method: 'POST'}),
      envNoSecret,
    );
    expect(postLogout.status).toBe(503);

    const home = await invokeOnRequest(
      onRequest,
      new Request(`${ORIGIN}/`, {method: 'GET'}),
      envNoSecret,
    );
    expect(home.status).toBe(200);
  });
});

describe('T-ENV-A / T-ENV-A2', () => {
  it('T-ENV-A: SESSION_SECRET without CAA client id → no caaLoginEnabled in root', async () => {
    const env = makeTestEnv({PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: ''});
    const res = await invokeOnRequest(onRequest, new Request(`${ORIGIN}/`), env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('/account/login');
  });

  it('T-ENV-A2: full CAA env serves storefront 200', async () => {
    const res = await invokeOnRequest(onRequest, new Request(`${ORIGIN}/`), makeTestEnv());
    expect(res.status).toBe(200);
  });
});
