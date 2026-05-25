/**
 * @epir/steward-contract — wspólne typy Store Steward (Worker ↔ Cursor SDK).
 * Bez zależności Cloudflare.
 */

export const STEWARD_BARRIERS = ['CENA', 'BRAK_INFO', 'TRUST', 'ROZMIAR', 'CZAS'] as const;
export type StewardBarrier = (typeof STEWARD_BARRIERS)[number];

export const STEWARD_CONTRACT_VERSION = 1;

export type StoreSignalSource = 'd1_pixel' | 'r2_sql';

export interface StoreSignal {
  id: string;
  period_start: string;
  period_end: string;
  signal_key: string;
  storefront_id: string | null;
  channel: string | null;
  product_handle: string | null;
  product_id: string | null;
  metric_name: string;
  metric_value: number;
  metric_unit: string | null;
  evidence_json: string | null;
  source: StoreSignalSource;
  created_at?: string;
}

export interface StewardInsight {
  id: string;
  period_start: string;
  period_end: string;
  barrier: StewardBarrier | null;
  metric: string;
  baseline: number | null;
  delta: number | null;
  confidence: number;
  summary: string;
  evidence_json: string | null;
  status: 'open' | 'acknowledged' | 'acted';
  created_at?: string;
}

export interface StewardInsightsResponse {
  contract_version: number;
  period_start: string;
  period_end: string;
  signals: StoreSignal[];
  insights: StewardInsight[];
  warehouse_queries: Array<{
    queryId: string;
    ok: boolean;
    row_count: number;
    error?: string;
  }>;
}

export interface DailyStoreReportRequest {
  period_start?: string;
  period_end?: string;
}

export interface DailyStoreReport {
  period_start: string;
  period_end: string;
  markdown: string;
  generated_at: string;
}

/** Faza 1 — kontrakt kontekstu wstrzykiwanego do SessionDO (bez wdrożenia w chat w Fazie 0). */
export interface StewardSessionContext {
  contract_version: typeof STEWARD_CONTRACT_VERSION;
  session_id: string;
  barrier: StewardBarrier | null;
  insight_id: string | null;
  summary: string;
  injected_at: string;
  expires_at: string;
}

export function isStewardBarrier(value: string): value is StewardBarrier {
  return (STEWARD_BARRIERS as readonly string[]).includes(value);
}
