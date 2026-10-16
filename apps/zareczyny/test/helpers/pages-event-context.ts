import type {PagesFunction} from '@remix-run/cloudflare-pages';

type OnRequest = PagesFunction<Env>;

export function makeTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    SESSION_SECRET: 'integration-session-secret-32chars-min',
    PUBLIC_STOREFRONT_API_TOKEN: 'public-storefront-token',
    PRIVATE_STOREFRONT_API_TOKEN: 'private-storefront-token',
    PUBLIC_STORE_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
    PUBLIC_STOREFRONT_ID: '1000013955',
    PUBLIC_STOREFRONT_API_VERSION: '2025-10',
    PUBLIC_STOREFRONT_URL: 'https://zareczyny.epirbizuteria.pl',
    PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: 'integration-caa-client-id',
    SHOP_ID: '55145660472',
    BRAND: 'zareczyny',
    COLLECTION_FILTER: 'pierscionki-zareczynowe',
    COLLECTION_HUB_HANDLE: 'pierscionki-zareczynowe',
    ...overrides,
  } as Env;
}

export async function loadBuiltOnRequest(): Promise<OnRequest> {
  const {pathToFileURL} = await import('node:url');
  const bundleUrl = new URL('../functions/[[path]].js', import.meta.url);
  const mod = (await import(pathToFileURL(bundleUrl.href).href)) as {
    onRequest: OnRequest;
  };
  return mod.onRequest;
}

export function makePagesContext(
  request: Request,
  env: Env,
): Parameters<OnRequest>[0] {
  const assetsFetcher = {
    fetch: async () => new Response('Not Found', {status: 404}),
  };
  const data: Record<string, unknown> = {};
  const waitUntil = () => {};
  const passThroughOnException = () => {};

  return {
    request,
    env,
    waitUntil,
    passThroughOnException,
    next: () => new Response(),
    data,
    functionPath: '',
    params: {},
    assets: assetsFetcher as Fetcher,
    caches: globalThis.caches,
    cloudflare: {
      env,
      waitUntil,
      passThroughOnException,
      caches: globalThis.caches,
      ctx: {},
      data,
    },
  } as Parameters<OnRequest>[0];
}

export async function invokeOnRequest(
  onRequest: OnRequest,
  request: Request,
  env: Env,
): Promise<Response> {
  return onRequest(makePagesContext(request, env));
}
