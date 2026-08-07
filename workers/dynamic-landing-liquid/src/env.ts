export type Env = {
  SHOPIFY_STOREFRONT_DOMAIN: string;
  /** Public shop host for HTML origin fetch (e.g. epirbizuteria.pl). Same-zone subfetch bypasses the worker on apex. */
  SHOPIFY_PUBLIC_DOMAIN?: string;
  SHOPIFY_STOREFRONT_TOKEN?: string;
  SHOPIFY_STOREFRONT_API_VERSION?: string;
  CAMPAIGN_LANDING_TYPE?: string;
  CAMPAIGN_CACHE?: KVNamespace;
};

export const DEFAULT_CAMPAIGN_LANDING_TYPE =
  'app--280344821761--campaign_landing';
export const DEFAULT_STOREFRONT_API_VERSION = '2024-10';

export const MAPPING_KV_KEY = 'mapping:v1';
export const MAPPING_KV_TTL_SECONDS = 300;
export const LANDING_KV_TTL_SECONDS = 60;
