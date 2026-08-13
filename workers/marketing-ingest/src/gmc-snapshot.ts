/**
 * Osobny kształt snapshotu GMC → Pipelines/Iceberg (nie MarketingStreamRecord kampanii).
 * Tabela docelowa: marketing.gmc_product_status_daily (konfiguracja Pipeline SQL).
 * approved_total / pending_total / disapproved_total = SHOPPING_ADS + PL only.
 */
import type { GmcEnv } from './gmc';
import { fetchGmcDiagnostics } from './gmc';

export type GmcSnapshotRecord = {
  source: 'google_merchant';
  /** YYYY-MM-DD (dzień snapshotu UTC) */
  date: string;
  merchant_id: string | null;
  reporting_context: string;
  country: string;
  account_issue_count: number;
  products_scanned: number;
  products_with_issues: number;
  /** SHOPPING_ADS + PL */
  approved_total: number;
  pending_total: number;
  disapproved_total: number;
  /** JSON: top account issues */
  top_account_issues_json: string;
  /** JSON: top product issue samples (products.list) */
  top_product_issues_json: string;
  /** JSON: full issue codes for SHOPPING_ADS+PL from aggregate */
  issue_codes_json: string;
  /** JSON: aggregate statuses (all contexts/countries) */
  aggregate_statuses_json: string;
};

export async function buildGmcSnapshotRecords(
  env: GmcEnv,
  date: string,
): Promise<GmcSnapshotRecord[]> {
  const d = await fetchGmcDiagnostics(env);
  if (d.skipped) {
    console.warn('[MARKETING_INGEST] GMC snapshot skip', d.skipReason);
    return [];
  }
  return [
    {
      source: 'google_merchant',
      date,
      merchant_id: d.merchantId,
      reporting_context: d.reportingContext,
      country: d.country,
      account_issue_count: d.summary.accountIssueCount,
      products_scanned: d.summary.productsScanned,
      products_with_issues: d.summary.productsWithIssues,
      approved_total: d.summary.approvedTotal,
      pending_total: d.summary.pendingTotal,
      disapproved_total: d.summary.disapprovedTotal,
      top_account_issues_json: JSON.stringify(d.accountIssues.slice(0, 20)),
      top_product_issues_json: JSON.stringify(d.productIssues.slice(0, 40)),
      issue_codes_json: JSON.stringify(d.issueCodes),
      aggregate_statuses_json: JSON.stringify(d.aggregateStatuses),
    },
  ];
}
