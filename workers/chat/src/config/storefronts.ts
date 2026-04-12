import type { Env } from './bindings';

type PublicStorefrontTokenEnvKey = 'PUBLIC_STOREFRONT_API_TOKEN_KAZKA' | 'PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY';
type PrivateStorefrontTokenEnvKey = 'PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY';
type StorefrontTokenEnvKey = PublicStorefrontTokenEnvKey;

export type StaticStorefrontConfig = {
  storefrontId: string;
  channel: string;
  aiProfileGid?: string;
  apiTokenEnvKey?: StorefrontTokenEnvKey;
  privateTokenEnvKey?: PrivateStorefrontTokenEnvKey;
};

export type ResolvedStorefrontConfig = StaticStorefrontConfig & {
  apiToken?: string;
  privateToken?: string;
};

/** Mapowanie aliasów storefrontów na konfigurację. Na drucie używamy aliasu (np. "kazka"), wewnątrz MCP – rzeczywisty Storefront ID. */
export const STOREFRONTS: Record<string, StaticStorefrontConfig> = {
  'online-store': {
    storefrontId: 'gid://shopify/Storefront/1000013955',
    channel: 'online-store',
    aiProfileGid: 'gid://shopify/Metaobject/2153911189836',
  },
  'epir-liquid': {
    storefrontId: 'gid://shopify/Storefront/1000013955',
    channel: 'online-store',
    aiProfileGid: 'gid://shopify/Metaobject/2153911189836',
  },
  /**
   * Theme App Extension / sklep klasyczny: `assistant-runtime.js` wysyła `brand: "epir"` (data-brand).
   * Bez tego aliasu worker nie dobierał aiProfileGid ani tokenu Storefront → 401 przy odczycie metaobject.
   */
  epir: {
    storefrontId: 'gid://shopify/Storefront/1000013955',
    channel: 'online-store',
    aiProfileGid: 'gid://shopify/Metaobject/2153911189836',
  },
  /** Opcjonalny alias hosta (np. przyszłe nagłówki / body z identyfikatorem domeny). */
  'epirbizuteria.pl': {
    storefrontId: 'gid://shopify/Storefront/1000013955',
    channel: 'online-store',
    aiProfileGid: 'gid://shopify/Metaobject/2153911189836',
  },
  kazka: {
    storefrontId: 'gid://shopify/Storefront/1000013955',
    channel: 'hydrogen-kazka',
    aiProfileGid: 'gid://shopify/Metaobject/2057969205580',
    apiTokenEnvKey: 'PUBLIC_STOREFRONT_API_TOKEN_KAZKA',
  },
  zareczyny: {
    storefrontId: 'gid://shopify/Storefront/1000013955',
    channel: 'hydrogen-zareczyny',
    /** Typ Admin: `ai_profile`, handle: zareczyny — opublikuj wpis (Active), inaczej Storefront zwróci null */
    aiProfileGid: 'gid://shopify/Metaobject/2117458166092',
    apiTokenEnvKey: 'PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY',
    privateTokenEnvKey: 'PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY',
  },
};

export function resolveStorefrontConfig(env: Env, storefrontKey?: string): ResolvedStorefrontConfig | null {
  if (!storefrontKey) return null;
  const config = STOREFRONTS[storefrontKey];
  if (!config) return null;
  return {
    ...config,
    apiToken: config.apiTokenEnvKey
      ? env[config.apiTokenEnvKey] ?? env.SHOPIFY_STOREFRONT_TOKEN
      : env.SHOPIFY_STOREFRONT_TOKEN,
    privateToken: config.privateTokenEnvKey
      ? env[config.privateTokenEnvKey] ?? env.PRIVATE_STOREFRONT_API_TOKEN
      : env.PRIVATE_STOREFRONT_API_TOKEN,
  };
}
