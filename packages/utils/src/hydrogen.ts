import {
  createStorefrontClient,
  type StorefrontHeaders,
} from '@shopify/hydrogen';
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
  /** Shopify-Storefront-Id (Hydrogen) — wartość jak w Admin → kanał Headless / z GID `.../Storefront/XXXX`. */
  PUBLIC_STOREFRONT_ID?: string;
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
  /** Gdy podany, Hydrogen ustawia storefrontHeaders (oxygen-buyer-ip / CF / X-Forwarded-For). */
  request?: Request;
}

/**
 * Nagłówki pod Storefront API jak na Oxygen, ale z typowymi polami Cloudflare / dev.
 * Brak buyer IP bywa traktowany jak ruch botów → 403.
 */
export function storefrontHeadersFromRequest(request: Request): StorefrontHeaders {
  const xff = request.headers.get('x-forwarded-for');
  const firstXff = xff?.split(',')[0]?.trim();

  return {
    requestGroupId: request.headers.get('request-id') ?? crypto.randomUUID(),
    buyerIp:
      request.headers.get('oxygen-buyer-ip') ||
      request.headers.get('CF-Connecting-IP') ||
      firstXff ||
      '',
    cookie: request.headers.get('cookie') ?? '',
    purpose: request.headers.get('purpose') ?? '',
  };
}

/**
 * Create a Hydrogen Storefront API client from a Cloudflare Pages context.
 * Shared between kazka and zareczyny storefronts.
 */
export async function getStoreFrontClient<T extends StorefrontEnv>(
  context: StorefrontContext<T>,
) {
  const i18n = storefrontI18nFromEnv(context.env);
  const sid = context.env.PUBLIC_STOREFRONT_ID?.trim();
  return createStorefrontClient({
    cache: await caches.open('hydrogen'),
    waitUntil: (p: Promise<unknown>) => context.waitUntil(p),
    privateStorefrontToken: context.env.PRIVATE_STOREFRONT_API_TOKEN,
    publicStorefrontToken: context.env.PUBLIC_STOREFRONT_API_TOKEN,
    storefrontApiVersion: context.env.PUBLIC_STOREFRONT_API_VERSION || '2025-10',
    storeDomain: `https://${context.env.PUBLIC_STORE_DOMAIN}`,
    ...(sid ? {storefrontId: sid} : {}),
    ...(context.request
      ? {storefrontHeaders: storefrontHeadersFromRequest(context.request)}
      : {}),
    i18n,
  });
}
