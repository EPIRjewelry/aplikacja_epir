/**
 * Audyt search terms (read-only) — klasyfikacja pod kontrakt EPIR.
 */
import type { AdsEnv } from './ads';
import { adsCustomerId, adsSearch } from './ads-api';
import { classifySearchTerm, type SearchTermBucket } from './ads-classify';
import { gaqlSegmentsDateBetween, resolveAdsDateWindow } from './ads-date-window';

export type SearchTermRow = {
  searchTerm: string;
  campaignName: string;
  adGroupName: string;
  clicks: number;
  impressions: number;
  ctr: number;
  bucket: SearchTermBucket;
};

export type SearchTermsAudit = {
  customerId: string;
  days: number;
  startDate: string;
  endDate: string;
  campaignFilter: string;
  rows: SearchTermRow[];
  byBucket: Record<string, number>;
  interpretation: string;
  samples: Partial<Record<SearchTermBucket, string[]>>;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function pick(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export async function auditSearchTerms(
  env: AdsEnv,
  opts?: {
    days?: number;
    startDate?: string;
    endDate?: string;
    campaignNameContains?: string;
    limit?: number;
    minCtr?: number;
  },
): Promise<SearchTermsAudit | { error: string }> {
  const { startDate, endDate, days } = resolveAdsDateWindow(opts);
  const campaignFilter = opts?.campaignNameContains?.trim() || 'Epir_Forest-Dark';
  const limit = Math.min(Math.max(opts?.limit ?? 200, 10), 1000);
  const minCtr = opts?.minCtr ?? 0.01;
  const escaped = campaignFilter.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const query = `
    SELECT
      search_term_view.search_term,
      campaign.name,
      ad_group.name,
      metrics.clicks,
      metrics.impressions,
      metrics.ctr
    FROM search_term_view
    WHERE ${gaqlSegmentsDateBetween(startDate, endDate)}
      AND campaign.name LIKE '%${escaped}%'
      AND metrics.impressions > 0
    ORDER BY metrics.clicks DESC
    LIMIT ${limit}
  `.trim();

  const search = await adsSearch(env, query);
  if (!search.ok) return { error: search.error };

  const rows: SearchTermRow[] = [];
  const byBucket: Record<string, number> = {};
  const samples: Partial<Record<SearchTermBucket, string[]>> = {};

  for (const r of search.results) {
    const term = str(pick(r, ['searchTermView', 'searchTerm']));
    const clicks = num(pick(r, ['metrics', 'clicks']));
    const impressions = num(pick(r, ['metrics', 'impressions']));
    const ctr = num(pick(r, ['metrics', 'ctr']));
    const bucket = classifySearchTerm(term, { ctr, minCtr });
    rows.push({
      searchTerm: term,
      campaignName: str(pick(r, ['campaign', 'name'])),
      adGroupName: str(pick(r, ['adGroup', 'name'])),
      clicks,
      impressions,
      ctr,
      bucket,
    });
    byBucket[bucket] = (byBucket[bucket] ?? 0) + 1;
    if (!samples[bucket]) samples[bucket] = [];
    if ((samples[bucket]?.length ?? 0) < 5) samples[bucket]!.push(term);
  }

  const bargain = byBucket.bargain_hunter ?? 0;
  const lowCtr = byBucket.low_ctr ?? 0;
  const interpretation =
    bargain > 0
      ? `${bargain} fraz klasyfikowanych jako bargain_hunter — rozważ negatywy / korektę Search Themes.`
      : lowCtr > 0
        ? `${lowCtr} fraz z niskim CTR — sprawdź dopasowanie landingów i tematów.`
        : 'Brak oczywistych „łowców okazji” w top frazach z okresu.';

  return {
    customerId: adsCustomerId(env),
    days,
    startDate,
    endDate,
    campaignFilter,
    rows,
    byBucket,
    interpretation,
    samples,
  };
}
