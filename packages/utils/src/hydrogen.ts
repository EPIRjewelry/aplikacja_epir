import {createStorefrontClient} from '@shopify/hydrogen';

/**
 * Minimal env interface required by getStoreFrontClient.
 * Both kazka and zareczyny Env types satisfy this structurally.
 */
export interface StorefrontEnv {
  PRIVATE_STOREFRONT_API_TOKEN: string;
  PUBLIC_STOREFRONT_API_TOKEN: string;
  PUBLIC_STOREFRONT_API_VERSION?: string;
  PUBLIC_STORE_DOMAIN: string;
}

/**
 * Minimal context interface required by getStoreFrontClient.
 * Compatible with Cloudflare Pages EventContext<Env, string, unknown>.
 */
export interface StorefrontContext<T extends StorefrontEnv = StorefrontEnv> {
  env: T;
  waitUntil: (p: Promise<unknown>) => void;
}

/**
 * Create a Hydrogen Storefront API client from a Cloudflare Pages context.
 * Shared between kazka and zareczyny storefronts.
 */
export async function getStoreFrontClient<T extends StorefrontEnv>(
  context: StorefrontContext<T>,
) {
  return createStorefrontClient({
    cache: await caches.open('hydrogen'),
    waitUntil: (p: Promise<unknown>) => context.waitUntil(p),
    privateStorefrontToken: context.env.PRIVATE_STOREFRONT_API_TOKEN,
    publicStorefrontToken: context.env.PUBLIC_STOREFRONT_API_TOKEN,
    storefrontApiVersion: context.env.PUBLIC_STOREFRONT_API_VERSION || '2025-10',
    storeDomain: `https://${context.env.PUBLIC_STORE_DOMAIN}`,
  });
}
