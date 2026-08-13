/**
 * Negatywne słowa kluczowe — kampanie Search *27.04.2026* (audyt + apply z blocklisty).
 */
import type { AdsEnv } from './ads';
import { adsCustomerId, adsMutate, adsSearch } from './ads-api';

export const SEARCH_CAMPAIGN_FILTER = '%27.04.2026%';

/** Frazy do negatywu (broad) — wspólna blocklist z Search Themes. */
export function defaultSearchNegativeKeywords(): string[] {
  return [
    'promocje',
    'okazja',
    'tanio',
    'używane',
    'uzywane',
    'stare pierścionki',
    'brylanty używane',
    'komis',
    'outlet',
    'wyprzedaż',
    'rabat',
    'second hand',
    'allegro używane',
    'olx',
  ];
}

export type CampaignNegativeRow = {
  resourceName: string;
  campaignId: string;
  campaignName: string;
  keyword: string;
  matchType: string;
};

export async function auditSearchNegatives(
  env: AdsEnv,
  opts?: { campaignFilter?: string },
): Promise<
  | {
      campaignFilter: string;
      existing: CampaignNegativeRow[];
      proposed: string[];
      missing: string[];
    }
  | { error: string }
> {
  const campaignFilter = opts?.campaignFilter ?? SEARCH_CAMPAIGN_FILTER;
  const query = `
    SELECT
      campaign_criterion.resource_name,
      campaign_criterion.keyword.text,
      campaign_criterion.keyword.match_type,
      campaign.id,
      campaign.name
    FROM campaign_criterion
    WHERE campaign_criterion.type = 'KEYWORD'
      AND campaign_criterion.negative = TRUE
      AND campaign.name LIKE '${campaignFilter.replace(/'/g, "\\'")}'
      AND campaign.status != 'REMOVED'
    LIMIT 500
  `.trim();

  const search = await adsSearch(env, query);
  if (!search.ok) return { error: search.error };

  const existing: CampaignNegativeRow[] = search.results.map((r) => {
    const cc = r.campaignCriterion as Record<string, unknown>;
    const kw = (cc?.keyword ?? {}) as Record<string, unknown>;
    const camp = r.campaign as Record<string, unknown>;
    return {
      resourceName: String(cc?.resourceName ?? ''),
      campaignId: String(camp?.id ?? ''),
      campaignName: String(camp?.name ?? ''),
      keyword: String(kw?.text ?? ''),
      matchType: String(kw?.matchType ?? ''),
    };
  });

  const proposed = defaultSearchNegativeKeywords();
  const existingNorm = new Set(existing.map((e) => e.keyword.toLowerCase()));
  const missing = proposed.filter((k) => !existingNorm.has(k.toLowerCase()));

  return { campaignFilter, existing, proposed, missing };
}

export async function applySearchNegatives(
  env: AdsEnv,
  opts?: { campaignFilter?: string; dryRun?: boolean; keywords?: string[] },
): Promise<Record<string, unknown>> {
  const dryRun = opts?.dryRun !== false;
  const audit = await auditSearchNegatives(env, opts);
  if ('error' in audit) return { ok: false, error: audit.error };

  const keywords = opts?.keywords ?? audit.missing;
  if (!keywords.length) {
    return {
      ok: true,
      dryRun,
      message: 'Brak brakujących negatywów do dodania.',
      audit,
    };
  }

  const campaignFilter = opts?.campaignFilter ?? SEARCH_CAMPAIGN_FILTER;
  const campSearch = await adsSearch(
    env,
    `
    SELECT campaign.id, campaign.name, campaign.resource_name
    FROM campaign
    WHERE campaign.name LIKE '${campaignFilter.replace(/'/g, "\\'")}'
      AND campaign.status != 'REMOVED'
    LIMIT 20
  `.trim(),
  );
  if (!campSearch.ok) return { ok: false, error: campSearch.error };
  if (!campSearch.results.length) {
    return { ok: false, error: `no campaigns matching ${campaignFilter}` };
  }

  const customerId = adsCustomerId(env);
  if (dryRun) {
    const plans: Array<{ campaignId: string; campaignName: string; keyword: string }> = [];
    for (const row of campSearch.results) {
      const camp = row.campaign as { id?: string; name?: string };
      for (const keyword of keywords) {
        plans.push({
          campaignId: String(camp.id ?? ''),
          campaignName: String(camp.name ?? ''),
          keyword,
        });
      }
    }
    return {
      ok: true,
      dryRun: true,
      campaignFilter,
      keywords,
      planCount: plans.length,
      plans: plans.slice(0, 50),
    };
  }

  const mutateResults: unknown[] = [];
  for (const row of campSearch.results) {
    const camp = row.campaign as {
      id?: string;
      name?: string;
      resourceName?: string;
    };
    const campaignRn =
      camp.resourceName ?? `customers/${customerId}/campaigns/${camp.id}`;
    for (const keyword of keywords) {
      const mutated = await adsMutate(env, 'campaignCriteria:mutate', {
        operations: [
          {
            create: {
              campaign: campaignRn,
              negative: true,
              keyword: {
                text: keyword,
                matchType: 'BROAD',
              },
            },
          },
        ],
      });
      mutateResults.push({
        campaignName: camp.name,
        keyword,
        mutate: mutated,
      });
      if (!mutated.ok) {
        return {
          ok: false,
          error: mutated.error,
          partialResults: mutateResults,
        };
      }
    }
  }

  const after = await auditSearchNegatives(env, opts);
  return {
    ok: true,
    dryRun: false,
    mutateResults,
    after,
  };
}
