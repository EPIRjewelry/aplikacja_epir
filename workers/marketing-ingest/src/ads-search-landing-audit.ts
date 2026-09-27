/**
 * Read-only: where Search ads are set to land, plus last-14d clicked landing pages.
 */
import type { AdsEnv } from './ads';
import { adsSearch } from './ads-api';

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

const SEARCH = 'Search-27.04.2026';
const DEFAULT_DAYS = 14;

function clampDays(days: number | undefined): number {
  const n = Number.isFinite(days) ? Math.floor(days as number) : DEFAULT_DAYS;
  return Math.min(90, Math.max(1, n));
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export async function auditSearchLandings(
  env: AdsEnv,
  opts?: { days?: number },
): Promise<Record<string, unknown>> {
  const days = clampDays(opts?.days);
  const ads = await adsSearch(
    env,
    `
    SELECT
      campaign.name,
      ad_group.name,
      ad_group_ad.status,
      ad_group_ad.ad.id,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group.final_url_suffix
    FROM ad_group_ad
    WHERE campaign.name = '${SEARCH}'
      AND ad_group_ad.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
    LIMIT 200
  `.trim(),
  );
  if (!ads.ok) return { ok: false, stage: 'ads', error: ads.error };

  const sitelinks = await adsSearch(
    env,
    `
    SELECT
      campaign.name,
      asset.sitelink_asset.link_text,
      asset.final_urls,
      campaign_asset.status
    FROM campaign_asset
    WHERE campaign.name = '${SEARCH}'
      AND campaign_asset.field_type = 'SITELINK'
      AND campaign_asset.status != 'REMOVED'
    LIMIT 100
  `.trim(),
  );

  const landings = await adsSearch(
    env,
    `
    SELECT
      campaign.name,
      landing_page_view.unexpanded_final_url,
      metrics.clicks,
      metrics.impressions
    FROM landing_page_view
    WHERE campaign.name = '${SEARCH}'
      AND segments.date DURING LAST_${days}_DAYS
      AND metrics.clicks > 0
    ORDER BY metrics.clicks DESC
    LIMIT 100
  `.trim(),
  );

  const adRows = ads.results.map((r) => ({
    adGroup: str(pick(r, ['adGroup', 'name'])),
    adId: str(pick(r, ['adGroupAd', 'ad', 'id'])),
    adType: str(pick(r, ['adGroupAd', 'ad', 'type'])),
    status: str(pick(r, ['adGroupAd', 'status'])),
    finalUrls: (pick(r, ['adGroupAd', 'ad', 'finalUrls']) as string[] | undefined) ?? [],
    adGroupSuffix: str(pick(r, ['adGroup', 'finalUrlSuffix'])),
  }));

  const uniqueAdUrls = [...new Set(adRows.flatMap((a) => a.finalUrls))];

  const clickedRows = landings.ok
    ? landings.results.map((r) => ({
        url: str(pick(r, ['landingPageView', 'unexpandedFinalUrl'])),
        clicks: num(pick(r, ['metrics', 'clicks'])),
        impressions: num(pick(r, ['metrics', 'impressions'])),
      }))
    : [];

  const totalClicks = clickedRows.reduce((s, r) => s + r.clicks, 0);

  const clickedWithShare = clickedRows.map((r) => ({
    ...r,
    clickSharePct: pct(r.clicks, totalClicks),
  }));

  return {
    ok: true,
    readOnly: true,
    campaign: SEARCH,
    days,
    ads: adRows,
    uniqueAdFinalUrls: uniqueAdUrls,
    sitelinks: sitelinks.ok
      ? sitelinks.results.map((r) => ({
          text: str(pick(r, ['asset', 'sitelinkAsset', 'linkText'])),
          urls: (pick(r, ['asset', 'finalUrls']) as string[] | undefined) ?? [],
          status: str(pick(r, ['campaignAsset', 'status'])),
        }))
      : { error: sitelinks.error },
    clickedTotals: { clicks: totalClicks },
    clickedLastNDays: landings.ok ? clickedWithShare : { error: landings.error },
  };
}
