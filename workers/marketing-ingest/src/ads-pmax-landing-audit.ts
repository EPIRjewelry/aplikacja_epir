/**
 * Read-only: PMax clicked landing pages per URL and ad network (freeze monitoring).
 */
import type { AdsEnv } from './ads';
import { adsSearch } from './ads-api';
import {
  FREEZE_COLLECTION_GALAZKI,
  FREEZE_GOLD_COLLECTION,
  FREEZE_PDP_TURMALIN,
  FREEZE_SILVER_COLLECTION,
} from './ads-freeze-apply';

function pick(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const DEFAULT_PMAX_CAMPAIGN = 'Epir_Forest-Dark';
export const DEFAULT_DAYS = 14;
export const PMAX_LANDING_ROW_LIMIT = 200;

export const FREEZE_LANDING_TARGETS = [
  { key: 'FREEZE_GOLD_COLLECTION', url: FREEZE_GOLD_COLLECTION, label: 'zlota-bizuteria' },
  { key: 'FREEZE_SILVER_COLLECTION', url: FREEZE_SILVER_COLLECTION, label: 'pierscionki-obraczki' },
  { key: 'FREEZE_PDP_TURMALIN', url: FREEZE_PDP_TURMALIN, label: 'turmalin-pdp' },
  { key: 'FREEZE_COLLECTION_GALAZKI', url: FREEZE_COLLECTION_GALAZKI, label: 'kolekcja-galazki' },
] as const;

export interface PmaxLandingRow {
  url: string;
  network: string;
  clicks: number;
  impressions: number;
  costMicros: number;
}

export interface PmaxUrlAggregate {
  url: string;
  clicks: number;
  impressions: number;
  costMicros: number;
  clickSharePct: number;
}

export interface PmaxNetworkAggregate {
  network: string;
  clicks: number;
  impressions: number;
  costMicros: number;
  clickSharePct: number;
}

export interface PmaxFreezeTarget {
  key: string;
  label: string;
  approvedUrl: string;
  matched: boolean;
  clicks: number;
  impressions: number;
  costMicros: number;
  clickSharePct: number;
}

/** Remove PMax URL expansion placeholders returned by Ads API. */
export function sanitizeAdsLandingUrl(raw: string): string {
  return raw.replace(/\{ignore\}/gi, '').replace(/%7Bignore%7D/gi, '');
}

export function stripIgnorePlaceholder(path: string): string {
  return sanitizeAdsLandingUrl(path).replace(/\/$/, '') || '/';
}

function landingPathname(raw: string): string {
  const trimmed = sanitizeAdsLandingUrl(raw.trim());
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    return stripIgnorePlaceholder(u.pathname);
  } catch {
    const noHash = trimmed.split('#')[0] ?? trimmed;
    const noQuery = noHash.split('?')[0] ?? noHash;
    try {
      const u = new URL(`https://epirbizuteria.pl${noQuery.startsWith('/') ? '' : '/'}${noQuery}`);
      return stripIgnorePlaceholder(u.pathname);
    } catch {
      return stripIgnorePlaceholder(noQuery);
    }
  }
}

/** Strip query/fragment, {ignore} placeholders; normalize trailing slash for grouping. */
export function normalizeLandingUrl(raw: string): string {
  const trimmed = sanitizeAdsLandingUrl(raw.trim());
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    const path = landingPathname(trimmed);
    return `${u.origin}${path}`;
  } catch {
    const path = landingPathname(trimmed);
    if (path.startsWith('/')) return `https://epirbizuteria.pl${path}`;
    return path;
  }
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function aggregatePmaxLandings(
  rows: PmaxLandingRow[],
  rowLimit = PMAX_LANDING_ROW_LIMIT,
): {
  byUrl: PmaxUrlAggregate[];
  byNetwork: PmaxNetworkAggregate[];
  totals: { clicks: number; impressions: number; costMicros: number };
  truncated: boolean;
} {
  const urlMap = new Map<string, { clicks: number; impressions: number; costMicros: number }>();
  const networkMap = new Map<string, { clicks: number; impressions: number; costMicros: number }>();
  let totalClicks = 0;
  let totalImpressions = 0;
  let totalCostMicros = 0;

  for (const row of rows) {
    const normUrl = normalizeLandingUrl(row.url);
    if (!normUrl) continue;
    totalClicks += row.clicks;
    totalImpressions += row.impressions;
    totalCostMicros += row.costMicros;

    const urlEntry = urlMap.get(normUrl) ?? { clicks: 0, impressions: 0, costMicros: 0 };
    urlEntry.clicks += row.clicks;
    urlEntry.impressions += row.impressions;
    urlEntry.costMicros += row.costMicros;
    urlMap.set(normUrl, urlEntry);

    const net = row.network || 'UNSPECIFIED';
    const netEntry = networkMap.get(net) ?? { clicks: 0, impressions: 0, costMicros: 0 };
    netEntry.clicks += row.clicks;
    netEntry.impressions += row.impressions;
    netEntry.costMicros += row.costMicros;
    networkMap.set(net, netEntry);
  }

  const byUrl = [...urlMap.entries()]
    .map(([url, m]) => ({
      url,
      clicks: m.clicks,
      impressions: m.impressions,
      costMicros: m.costMicros,
      clickSharePct: pct(m.clicks, totalClicks),
    }))
    .sort((a, b) => b.clicks - a.clicks);

  const byNetwork = [...networkMap.entries()]
    .map(([network, m]) => ({
      network,
      clicks: m.clicks,
      impressions: m.impressions,
      costMicros: m.costMicros,
      clickSharePct: pct(m.clicks, totalClicks),
    }))
    .sort((a, b) => b.clicks - a.clicks);

  const truncated = rows.length >= rowLimit;

  return {
    byUrl,
    byNetwork,
    totals: { clicks: totalClicks, impressions: totalImpressions, costMicros: totalCostMicros },
    truncated,
  };
}

export function matchFreezeTargets(
  byUrl: PmaxUrlAggregate[],
  targets: ReadonlyArray<{ key: string; url: string; label: string }> = FREEZE_LANDING_TARGETS,
): PmaxFreezeTarget[] {
  const totalClicks = byUrl.reduce((s, u) => s + u.clicks, 0);

  return targets.map((t) => {
    const targetPath = landingPathname(t.url);
    let clicks = 0;
    let impressions = 0;
    let costMicros = 0;
    let matched = false;

    for (const row of byUrl) {
      const rowPath = landingPathname(row.url);
      if (rowPath === targetPath || rowPath.startsWith(`${targetPath}/`)) {
        matched = true;
        clicks += row.clicks;
        impressions += row.impressions;
        costMicros += row.costMicros;
      }
    }

    return {
      key: t.key,
      label: t.label,
      approvedUrl: t.url,
      matched,
      clicks,
      impressions,
      costMicros,
      clickSharePct: pct(clicks, totalClicks),
    };
  });
}

function clampDays(days: number | undefined): number {
  const n = Number.isFinite(days) ? Math.floor(days as number) : DEFAULT_DAYS;
  return Math.min(90, Math.max(1, n));
}

function escapeGaqlLiteral(value: string): string {
  return value.replace(/'/g, "\\'");
}

export async function auditPmaxLandings(
  env: AdsEnv,
  opts?: { campaign?: string; days?: number },
): Promise<Record<string, unknown>> {
  const campaign = (opts?.campaign ?? DEFAULT_PMAX_CAMPAIGN).trim() || DEFAULT_PMAX_CAMPAIGN;
  const days = clampDays(opts?.days);

  const landings = await adsSearch(
    env,
    `
    SELECT
      campaign.name,
      segments.ad_network_type,
      landing_page_view.unexpanded_final_url,
      metrics.clicks,
      metrics.impressions,
      metrics.cost_micros
    FROM landing_page_view
    WHERE campaign.name = '${escapeGaqlLiteral(campaign)}'
      AND segments.date DURING LAST_${days}_DAYS
      AND metrics.impressions > 0
    ORDER BY metrics.clicks DESC
    LIMIT ${PMAX_LANDING_ROW_LIMIT}
  `.trim(),
  );

  if (!landings.ok) {
    return { ok: false, stage: 'ads', error: landings.error, campaign, days };
  }

  const rows: PmaxLandingRow[] = landings.results.map((r) => ({
    url: str(pick(r, ['landingPageView', 'unexpandedFinalUrl'])),
    network: str(pick(r, ['segments', 'adNetworkType'])),
    clicks: num(pick(r, ['metrics', 'clicks'])),
    impressions: num(pick(r, ['metrics', 'impressions'])),
    costMicros: num(pick(r, ['metrics', 'costMicros'])),
  }));

  const aggregated = aggregatePmaxLandings(rows, PMAX_LANDING_ROW_LIMIT);
  const freezeTargets = matchFreezeTargets(aggregated.byUrl);

  return {
    ok: true,
    readOnly: true,
    fetchedAt: new Date().toISOString(),
    campaign,
    days,
    rowLimit: PMAX_LANDING_ROW_LIMIT,
    truncated: aggregated.truncated,
    totals: aggregated.totals,
    byUrl: aggregated.byUrl,
    byNetwork: aggregated.byNetwork,
    freezeTargets,
    rawRowCount: rows.length,
  };
}
