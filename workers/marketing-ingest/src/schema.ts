/**
 * Rekord strumienia marketingowego → Pipelines (JSON).
 * Tabela docelowa Iceberg (namespace `marketing.*`) definiuje się w konfiguracji Pipeline SQL;
 * ten kształt jest zgodny z typowym schematem streamu (źródło, dzień, kampania, metryki).
 */
export type MarketingSource = 'google_analytics' | 'google_ads';

export interface MarketingStreamRecord {
  source: MarketingSource;
  /** YYYY-MM-DD */
  date: string;
  campaign_id: string | null;
  campaign_name: string | null;
  session_source: string | null;
  metric_sessions: number | null;
  metric_conversions: number | null;
  metric_revenue: number | null;
  metric_impressions: number | null;
  metric_clicks: number | null;
  metric_cost: number | null;
}

/** Przykładowe rekordy do smoke / dokumentacji Pipelines (pole `fields` w UI). */
export const EXAMPLE_GA4_RECORD: MarketingStreamRecord = {
  source: 'google_analytics',
  date: '2026-05-13',
  campaign_id: null,
  campaign_name: '(direct)',
  session_source: 'google',
  metric_sessions: 42,
  metric_conversions: 3,
  metric_revenue: 120.5,
  metric_impressions: null,
  metric_clicks: null,
  metric_cost: null,
};

export const EXAMPLE_ADS_RECORD: MarketingStreamRecord = {
  source: 'google_ads',
  date: '2026-05-13',
  campaign_id: '123456',
  campaign_name: 'Spring rings',
  session_source: null,
  metric_sessions: null,
  metric_conversions: 2,
  metric_revenue: null,
  metric_impressions: 10000,
  metric_clicks: 250,
  metric_cost: 45.67,
};
