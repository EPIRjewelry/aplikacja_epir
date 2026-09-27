/**
 * Exclude exact homepage URLs from ad landings (WEBPAGE negative, URL EQUALS).
 * Campaigns: Epir_Forest-Dark + Search-27.04.2026 only. Create-only.
 */
import type { AdsEnv } from './ads';
import { adsCustomerId, adsMutate, adsSearch } from './ads-api';

export const FREEZE_CAMPAIGNS_HOME_EXCLUDE = ['Epir_Forest-Dark', 'Search-27.04.2026'] as const;

/** Exact homepage variants — EQUALS only (never CONTAINS on domain). */
export const HOMEPAGE_EXCLUSION_URLS = [
  'https://epirbizuteria.pl/',
  'https://epirbizuteria.pl',
  'https://www.epirbizuteria.pl/',
  'https://www.epirbizuteria.pl',
  'http://epirbizuteria.pl/',
  'http://epirbizuteria.pl',
  'http://www.epirbizuteria.pl/',
  'http://www.epirbizuteria.pl',
] as const;

export const HOMEPAGE_EXCLUSION_OPERATOR = 'EQUALS' as const;

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

/** Loose key for deduping against API-returned arguments. */
export function normalizeHomeUrlKey(url: string): string {
  const t = url.trim().toLowerCase();
  try {
    const u = new URL(t.includes('://') ? t : `https://${t}`);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname.replace(/\/$/, '') || '';
    const proto = u.protocol.replace(':', '');
    return `${proto}://${host}${path === '' ? '' : path}`;
  } catch {
    return t.replace(/\/$/, '');
  }
}

export function extractExcludedHomeUrlsFromCriterion(row: Record<string, unknown>): string[] {
  const conditions = pick(row, ['campaignCriterion', 'webpage', 'conditions']);
  if (!Array.isArray(conditions)) return [];
  const out: string[] = [];
  for (const c of conditions) {
    const cond = c as Record<string, unknown>;
    const operand = str(cond.operand);
    const operator = str(cond.operator);
    const argument = str(cond.argument);
    if (operand === 'URL' && operator === HOMEPAGE_EXCLUSION_OPERATOR && argument) {
      out.push(argument);
    }
  }
  return out;
}

export function planHomeExclusions(
  existingByCampaign: Record<string, string[]>,
  urls: readonly string[] = HOMEPAGE_EXCLUSION_URLS,
): Array<{ campaign: string; url: string }> {
  const plan: Array<{ campaign: string; url: string }> = [];
  for (const campaign of FREEZE_CAMPAIGNS_HOME_EXCLUDE) {
    const have = new Set((existingByCampaign[campaign] ?? []).map((u) => u.trim().toLowerCase()));
    for (const url of urls) {
      if (!have.has(url.trim().toLowerCase())) {
        plan.push({ campaign, url });
      }
    }
  }
  return plan;
}

function criterionNameForUrl(url: string): string {
  const slug = url.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 80);
  return `exclude_home_${slug}`;
}

export async function applyAdsExcludeHome(
  env: AdsEnv,
  opts?: { dryRun?: boolean },
): Promise<Record<string, unknown>> {
  const dryRun = opts?.dryRun !== false;
  const names = FREEZE_CAMPAIGNS_HOME_EXCLUDE.map((n) => `'${n.replace(/'/g, "\\'")}'`).join(', ');

  const campRes = await adsSearch(
    env,
    `
    SELECT campaign.id, campaign.name, campaign.resource_name
    FROM campaign
    WHERE campaign.name IN (${names})
      AND campaign.status != 'REMOVED'
    LIMIT 10
  `.trim(),
  );
  if (!campRes.ok) return { ok: false, stage: 'campaign', error: campRes.error };

  const campaignRn = new Map<string, string>();
  for (const r of campRes.results) {
    const name = str(pick(r, ['campaign', 'name']));
    const rn = str(pick(r, ['campaign', 'resourceName']));
    if (name && rn) campaignRn.set(name, rn);
  }

  const critRes = await adsSearch(
    env,
    `
    SELECT
      campaign.name,
      campaign_criterion.criterion_id,
      campaign_criterion.negative,
      campaign_criterion.type,
      campaign_criterion.webpage.criterion_name,
      campaign_criterion.webpage.conditions
    FROM campaign_criterion
    WHERE campaign_criterion.type = 'WEBPAGE'
      AND campaign.name IN (${names})
      AND campaign_criterion.negative = TRUE
    LIMIT 200
  `.trim(),
  );
  if (!critRes.ok) return { ok: false, stage: 'webpage_read', error: critRes.error };

  const existingByCampaign: Record<string, string[]> = {};
  for (const c of FREEZE_CAMPAIGNS_HOME_EXCLUDE) {
    existingByCampaign[c] = [];
  }
  for (const r of critRes.results) {
    const campaign = str(pick(r, ['campaign', 'name']));
    if (!campaign) continue;
    const urls = extractExcludedHomeUrlsFromCriterion(r as Record<string, unknown>);
    if (!existingByCampaign[campaign]) existingByCampaign[campaign] = [];
    existingByCampaign[campaign].push(...urls);
  }

  const plan = planHomeExclusions(existingByCampaign);
  const snapshot = {
    ok: true,
    readOnly: dryRun,
    operator: HOMEPAGE_EXCLUSION_OPERATOR,
    campaigns: [...FREEZE_CAMPAIGNS_HOME_EXCLUDE],
    existingByCampaign,
    plan,
    planCount: plan.length,
    homepageUrls: [...HOMEPAGE_EXCLUSION_URLS],
  };

  if (!plan.length) {
    return { ...snapshot, dryRun, mutated: false, message: 'All homepage exclusions already present.' };
  }

  if (dryRun) {
    return { ...snapshot, dryRun: true, mutated: false };
  }

  const mutateResults: unknown[] = [];
  for (const item of plan) {
    const campaign = campaignRn.get(item.campaign);
    if (!campaign) {
      return {
        ok: false,
        stage: 'mutate',
        error: `campaign resource missing: ${item.campaign}`,
        ...snapshot,
        mutateResults,
      };
    }
    const mutated = await adsMutate(env, 'campaignCriteria:mutate', {
      operations: [
        {
          create: {
            campaign,
            negative: true,
            webpage: {
              criterionName: criterionNameForUrl(item.url),
              conditions: [
                {
                  operand: 'URL',
                  operator: HOMEPAGE_EXCLUSION_OPERATOR,
                  argument: item.url,
                },
              ],
            },
          },
        },
      ],
    });
    mutateResults.push({ ...item, mutate: mutated });
    if (!mutated.ok) {
      return {
        ok: false,
        stage: 'mutate',
        error: mutated.error,
        ...snapshot,
        dryRun: false,
        mutated: false,
        mutateResults,
      };
    }
  }

  return {
    ...snapshot,
    dryRun: false,
    mutated: true,
    mutateResults,
    customerId: adsCustomerId(env),
  };
}
