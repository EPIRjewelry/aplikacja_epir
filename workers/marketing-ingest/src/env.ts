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
  /** Bearer do GET /ops/marketing-preview oraz do `/ops/marketing-analyst/*` (Durable Object). Brak sekretu → 404. */
  MARKETING_OPS_PREVIEW_KEY?: string;
  /** Durable Object — stanowy podgląd GA4+Ads (ten sam kod co preview, bez npm `agents`). */
  MarketingAnalystAgent: DurableObjectNamespace;
}
