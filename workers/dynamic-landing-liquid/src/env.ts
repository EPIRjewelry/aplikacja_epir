export type Env = {
  SHOPIFY_STOREFRONT_DOMAIN: string;
  /** Public shop host (apex). Used for Host / Ads URLs. */
  SHOPIFY_PUBLIC_DOMAIN?: string;
  SHOPIFY_ORIGIN_IPV4?: string;
  /** Host for Ads final URLs (default l.epirbizuteria.pl). */
  ADS_LANDING_HOST?: string;
  /** When not "true", standalone/rewriter landings are disabled (traffic → product URLs). */
  LANDINGS_ENABLED?: string;
  /** GA4 Measurement ID (G-…) for l.epirbizuteria.pl — ten sam co apex (GTM też). */
  GA4_MEASUREMENT_ID?: string;
  /** Google Tag Manager container (default GTM-NQZ5QCG — jak epirbizuteria.pl). */
  GTM_CONTAINER_ID?: string;
  /** Google Ads conversion tag (AW-…) — opcjonalnie, jak apex. */
  GOOGLE_ADS_TAG_ID?: string;
  /** EPIR analytics pixel origin (default asystent.epirbizuteria.pl). */
  EPIR_PIXEL_ORIGIN?: string;
  /** Operator preview (reuse from workers/chat or marketing-ingest). */
  EPIR_OPERATOR_PANEL_SECRET?: string;
  MARKETING_OPS_PREVIEW_KEY?: string;
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
