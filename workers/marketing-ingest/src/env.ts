/// <reference types="@cloudflare/workers-types" />

/**
 * Env workera `epir-marketing-ingest` — w osobnym pliku, żeby uniknąć cyklu importów
 * `index.ts` ↔ `marketing-analyst-agent.ts`.
 */
export interface Env {
  /** HTTP ingest Pipelines (marketing stream). */
  MARKETING_PIPELINE_INGEST_URL?: string;
  MARKETING_PIPELINE_INGEST_TOKEN?: string;
  GA4_PROPERTY_ID?: string;
  GA4_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_ADS_CLIENT_ID?: string;
  GOOGLE_ADS_CLIENT_SECRET?: string;
  GOOGLE_ADS_REFRESH_TOKEN?: string;
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;
  GOOGLE_ADS_CUSTOMER_ID?: string;
  /** CID MCC bez myślników — nagłówek login-customer-id (Ads API). */
  GOOGLE_ADS_LOGIN_CUSTOMER_ID?: string;
  /**
   * Merchant Center account id (cyfry). Merchant API read-only.
   */
  GOOGLE_MERCHANT_ID?: string;
  /** OAuth client ID — osobny klient GCP pod Merchant (nie Ads). */
  GOOGLE_MERCHANT_CLIENT_ID?: string;
  /** OAuth client secret tego klienta Merchant. */
  GOOGLE_MERCHANT_CLIENT_SECRET?: string;
  /**
   * OAuth refresh ze scope `https://www.googleapis.com/auth/content`.
   * Osobny od GOOGLE_ADS_REFRESH_TOKEN.
   */
  GOOGLE_MERCHANT_REFRESH_TOKEN?: string;
  /** Bearer do GET /ops/marketing-preview oraz do `/ops/marketing-analyst/*` (Durable Object). Brak sekretu → 404. */
  MARKETING_OPS_PREVIEW_KEY?: string;
  /** Shopify Admin API — pull klientów do Customer Match (ten sam token co w root .dev.vars). */
  SHOPIFY_ADMIN_TOKEN?: string;
  SHOP?: string;
  /** Durable Object — stanowy podgląd GA4+Ads (ten sam kod co preview, bez npm `agents`). */
  MarketingAnalystAgent: DurableObjectNamespace;
  /** Prebuilt GMC CSV (written by epir-marketing-ingest Node pipeline → R2). */
  GMC_FEED?: R2Bucket;
}
