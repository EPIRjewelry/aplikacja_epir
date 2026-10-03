import {afterEach, describe, expect, it, vi} from 'vitest';
import {computeHmac} from '../src/hmac';
import {handleShopifyAppOAuth, type ShopifyAppOAuthEnv} from '../src/shopify-app-oauth';

const SHOP = 'test-shop.myshopify.com';
const SECRET = 'test-app-secret';
const TOKEN = 'test-admin-token';

const env: ShopifyAppOAuthEnv = {
  SHOPIFY_APP_SECRET: SECRET,
  SHOPIFY_CLIENT_ID: '80a9878cfb29c901c987bf0046a36238',
  SHOP_DOMAIN: SHOP,
};

type GraphqlCall = {query: string; variables?: {webPixel?: {settings?: string}; id?: string}};

async function signedCallback(): Promise<string> {
  const params = new URLSearchParams({
    code: 'oauth-code',
    shop: SHOP,
    state: 'epir_pixel_enable',
    timestamp: '1710000000',
  });
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
  pairs.sort();
  params.set('hmac', await computeHmac(SECRET, pairs.join('&')));
  return `https://asystent.epirbizuteria.pl/api/auth?${params.toString()}`;
}

function installFetch(graphql: (call: GraphqlCall) => unknown) {
  const calls: GraphqlCall[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/admin/oauth/access_token')) {
        return new Response(JSON.stringify({access_token: TOKEN}), {status: 200});
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as GraphqlCall;
      calls.push(body);
      const header = new Headers(init?.headers).get('X-Shopify-Access-Token');
      expect(header).toBe(TOKEN);
      return new Response(JSON.stringify(graphql(body)), {status: 200});
    }),
  );
  return {
    calls,
    printed() {
      return [...log.mock.calls, ...err.mock.calls, ...warn.mock.calls].flat().map(String).join('\n');
    },
  };
}

describe('GET /api/auth web pixel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates the pixel when Shopify says no web pixel was found', async () => {
    const fetchMock = installFetch((call) => {
      if (call.query.includes('webPixelCreate')) {
        return {
          data: {
            webPixelCreate: {
              userErrors: [],
              webPixel: {id: 'gid://shopify/WebPixel/1', settings: call.variables?.webPixel?.settings},
            },
          },
        };
      }
      if (call.query.includes('webPixelUpdate') || call.query.includes('webPixelDelete')) {
        throw new Error('missing pixel must not update or delete');
      }
      return {
        errors: [{message: 'No web pixel was found for this app.'}],
        data: {webPixel: null},
      };
    });

    const response = await handleShopifyAppOAuth(new Request(await signedCallback()), env);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Web pixel: created');
    expect(html).not.toContain('web pixel failed');
    expect(html).not.toContain(TOKEN);
    expect(html).toContain('gid://shopify/WebPixel/1');
    expect(fetchMock.calls.some((call) => call.query.includes('webPixelCreate'))).toBe(true);
    expect(fetchMock.calls.some((call) => call.query.includes('webPixelDelete'))).toBe(false);
    const create = fetchMock.calls.find((call) => call.query.includes('webPixelCreate'));
    expect(JSON.parse(create?.variables?.webPixel?.settings ?? '{}')).toEqual({
      accountID: 'epir',
      pixelEndpoint: 'https://asystent.epirbizuteria.pl',
    });
    expect(fetchMock.printed()).not.toContain(TOKEN);
  });

  it('updates an existing pixel instead of creating a second one', async () => {
    const fetchMock = installFetch((call) => {
      if (call.query.includes('webPixelUpdate')) {
        return {
          data: {
            webPixelUpdate: {
              userErrors: [],
              webPixel: {id: 'gid://shopify/WebPixel/7'},
            },
          },
        };
      }
      if (call.query.includes('webPixelCreate') || call.query.includes('webPixelDelete')) {
        throw new Error('existing pixel must not be created again or deleted');
      }
      return {
        data: {
          webPixel: {
            id: 'gid://shopify/WebPixel/7',
            settings: JSON.stringify({accountID: 'old', pixelEndpoint: 'https://example.invalid'}),
          },
        },
      };
    });

    const response = await handleShopifyAppOAuth(new Request(await signedCallback()), env);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Web pixel: updated');
    expect(html).not.toContain(TOKEN);
    expect(fetchMock.calls.filter((call) => call.query.includes('webPixelCreate'))).toHaveLength(0);
    expect(fetchMock.calls.some((call) => call.query.includes('webPixelUpdate'))).toBe(true);
    expect(fetchMock.printed()).not.toContain(TOKEN);
  });
});
