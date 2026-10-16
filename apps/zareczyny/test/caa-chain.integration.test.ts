/**
 * Integration harness (E1b v7): `functions/[[path]].js` after `npm run build`.
 *
 * Mutation regression (apply one mutation, rebuild, expect RED, revert):
 *
 * - **M-APP-1** — Remove outer `onRequest` wrapper in `server.ts` (export only
 *   `createPagesFunctionHandler` without post-`commit` `Set-Cookie` append).
 *   **T-CAA-CHAIN** fails: authorize returns 400/401 (state) without session cookie.
 * - **M-APP-2** — Keep wrapper but delete the `session?.isPending` / `append Set-Cookie` block.
 * - **M-APP-3** — Rename `account_.authorize.tsx` so `/account/authorize` is not routed → **404**.
 * - **M-APP-5** — Replace `data.__epirSession = session` with `context.cloudflare.data = { __epirSession }`
 *   (new object) so `context.data.__epirSession` is undefined in the wrapper.
 * - **M-SES** — Reintroduce `SESSION_SECRET` fallback string in `server.ts` (pre-E1b `29-31` pattern)
 *   while tests expect fail-closed `NoopSession` without secret.
 */
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  createIntegrationFetchStub,
  TEST_CUSTOMER_GID,
} from './helpers/integration-fetch-stub';
import {
  invokeOnRequest,
  loadBuiltOnRequest,
  makeTestEnv,
} from './helpers/pages-event-context';
import type {PagesFunction} from '@remix-run/cloudflare-pages';

const ORIGIN = 'https://zareczyny.epirbizuteria.pl';
let onRequest: PagesFunction<Env>;
let authorizeNonce: string | undefined;

beforeAll(async () => {
  onRequest = await loadBuiltOnRequest();
}, 120_000);

beforeEach(() => {
  authorizeNonce = undefined;
  const env = makeTestEnv();
  const stub = createIntegrationFetchStub({
    shopDomain: env.PUBLIC_STORE_DOMAIN,
    apiVersion: env.PUBLIC_STOREFRONT_API_VERSION || '2025-10',
    shopId: env.SHOP_ID!,
    getAuthorizeNonce: () => authorizeNonce,
  });
  vi.stubGlobal('fetch', stub);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('T-CAA-CHAIN', () => {
  it('login → Set-Cookie → authorize with nonce from Location → redirect', async () => {
    const env = makeTestEnv();
    const loginRes = await invokeOnRequest(
      onRequest,
      new Request(`${ORIGIN}/account/login`, {method: 'GET'}),
      env,
    );
    expect(loginRes.status).toBe(302);
    const location = loginRes.headers.get('Location');
    expect(location).toBeTruthy();
    const loginUrl = new URL(location!);
    authorizeNonce = loginUrl.searchParams.get('nonce') ?? undefined;
    expect(authorizeNonce).toBeTruthy();
    const state = loginUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    const setCookie = loginRes.headers.get('Set-Cookie');
    expect(setCookie).toContain('session=');

    const authorizeRes = await invokeOnRequest(
      onRequest,
      new Request(
        `${ORIGIN}/account/authorize?code=integration-code&state=${encodeURIComponent(state!)}`,
        {
          method: 'GET',
          headers: {Cookie: setCookie ?? ''},
        },
      ),
      env,
    );
    expect(authorizeRes.status).toBe(302);
    expect(authorizeRes.headers.get('Set-Cookie')).toContain('session=');
  });
});

describe('T-CAA-2 nonce mismatch', () => {
  it('authorize fails when token id_token nonce does not match login redirect', async () => {
    const env = makeTestEnv();
    const loginRes = await invokeOnRequest(
      onRequest,
      new Request(`${ORIGIN}/account/login`, {method: 'GET'}),
      env,
    );
    const state = new URL(loginRes.headers.get('Location')!).searchParams.get('state');
    authorizeNonce = 'wrong-nonce-not-from-location';

    const authorizeRes = await invokeOnRequest(
      onRequest,
      new Request(
        `${ORIGIN}/account/authorize?code=integration-code&state=${encodeURIComponent(state!)}`,
        {
          method: 'GET',
          headers: {Cookie: loginRes.headers.get('Set-Cookie') ?? ''},
        },
      ),
      env,
    );
    expect(authorizeRes.status).toBeGreaterThanOrEqual(400);
  });
});

describe('T-CAA-3 api.chat upstream header', () => {
  it('injects X-EPIR-LOGGED-IN-CUSTOMER-ID when CAA session active', async () => {
    const env = makeTestEnv({EPIR_CHAT_SHARED_SECRET: 'chat-secret'});
    const loginRes = await invokeOnRequest(
      onRequest,
      new Request(`${ORIGIN}/account/login`, {method: 'GET'}),
      env,
    );
    const loginUrl = new URL(loginRes.headers.get('Location')!);
    authorizeNonce = loginUrl.searchParams.get('nonce') ?? undefined;
    const state = loginUrl.searchParams.get('state');
    const cookie = loginRes.headers.get('Set-Cookie') ?? '';

    const authorizeRes = await invokeOnRequest(
      onRequest,
      new Request(
        `${ORIGIN}/account/authorize?code=integration-code&state=${encodeURIComponent(state!)}`,
        {method: 'GET', headers: {Cookie: cookie}},
      ),
      env,
    );
    expect(authorizeRes.status).toBe(302);
    const sessionCookie =
      authorizeRes.headers.get('Set-Cookie') ?? cookie;

    const captured: string[] = [];
    const upstreamFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers?.['X-EPIR-LOGGED-IN-CUSTOMER-ID']) {
        captured.push(headers['X-EPIR-LOGGED-IN-CUSTOMER-ID']);
      }
      return new Response(JSON.stringify({type: 'message', reply: 'ok'}), {
        status: 200,
        headers: {'content-type': 'application/json'},
      });
    });

    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes('asystent.epirbizuteria.pl/chat')) {
        return upstreamFetch(input, init);
      }
      return createIntegrationFetchStub({
        shopDomain: env.PUBLIC_STORE_DOMAIN,
        apiVersion: env.PUBLIC_STOREFRONT_API_VERSION || '2025-10',
        shopId: env.SHOP_ID!,
        getAuthorizeNonce: () => authorizeNonce,
      })(input, init);
    });

    const chatRes = await invokeOnRequest(
      onRequest,
      new Request(`${ORIGIN}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
        body: JSON.stringify({message: 'test', stream: false, session_id: 'sess_api_chat'}),
      }),
      env,
    );

    expect(chatRes.status).toBe(200);
    expect(captured).toContain(TEST_CUSTOMER_GID);
  });
});
