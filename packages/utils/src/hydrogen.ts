import {createStorefrontClient} from '@shopify/hydrogen';
import type {CountryCode, LanguageCode} from '@shopify/hydrogen/storefront-api-types';

/**
 * Minimal env interface required by getStoreFrontClient.
 * Both kazka and zareczyny Env types satisfy this structurally.
 */
export interface StorefrontEnv {
  PRIVATE_STOREFRONT_API_TOKEN: string;
  PUBLIC_STOREFRONT_API_TOKEN: string;
  PUBLIC_STOREFRONT_API_VERSION?: string;
  PUBLIC_STORE_DOMAIN: string;
  /** Domyślnie `PL` — wpływa na `storefront.i18n`, koszyk (`buyerIdentity.countryCode`) i zapytania Storefront API. */
  PUBLIC_STOREFRONT_COUNTRY?: string;
  /** Domyślnie `PL` — np. `PL` dla polskiego interfejsu sklepu. */
  PUBLIC_STOREFRONT_LANGUAGE?: string;
}

function storefrontI18nFromEnv(env: StorefrontEnv): {
  country: CountryCode;
  language: LanguageCode;
} {
  const country = (env.PUBLIC_STOREFRONT_COUNTRY?.trim() || 'PL') as CountryCode;
  const language = (env.PUBLIC_STOREFRONT_LANGUAGE?.trim() || 'PL') as LanguageCode;
  return {country, language};
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
  const i18n = storefrontI18nFromEnv(context.env);
  return createStorefrontClient({
    cache: await caches.open('hydrogen'),
    waitUntil: (p: Promise<unknown>) => context.waitUntil(p),
    privateStorefrontToken: context.env.PRIVATE_STOREFRONT_API_TOKEN,
    publicStorefrontToken: context.env.PUBLIC_STOREFRONT_API_TOKEN,
    storefrontApiVersion: context.env.PUBLIC_STOREFRONT_API_VERSION || '2025-10',
    storeDomain: `https://${context.env.PUBLIC_STORE_DOMAIN}`,
    i18n,
  });
}
