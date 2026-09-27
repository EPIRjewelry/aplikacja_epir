/**
 * One-shot Ads freeze apply (plan A–C). Mutates only conversion goals, PMax AG final URLs, Search campaign negatives.
 */
import type { AdsEnv } from './ads';
import { adsCustomerId, adsMutate, adsSearch } from './ads-api';
import { auditAdsAccountChanges } from './ads-account-change-audit';

/** SSOT: docs/working/ADS_ACCOUNT_FREEZE_2026-09-20.md — blocks live apply until operator unfreezes. */
export const ADS_ACCOUNT_FREEZE_ACTIVE = true;
export const ADS_ACCOUNT_FREEZE_UNTIL = '2026-10-11';

/** Operator-approved 2026-09-20. Do not invent extra URLs; ask operator first. */
export const FREEZE_GOLD_COLLECTION = 'https://epirbizuteria.pl/collections/zlota-bizuteria';
export const FREEZE_SILVER_COLLECTION =
  'https://epirbizuteria.pl/collections/pierscionki-obraczki';
export const FREEZE_PDP_TURMALIN =
  'https://epirbizuteria.pl/products/pierscionek-galazki-z-czarnym-turmalinem';
export const FREEZE_COLLECTION_GALAZKI =
  'https://epirbizuteria.pl/collections/kolekcja-galazki';

export const FREEZE_PMAX_FINAL_URL: Record<string, string> = {
  EPIR_Zloto: FREEZE_GOLD_COLLECTION,
  EPIR_Srebro: FREEZE_SILVER_COLLECTION,
};

export const FREEZE_SITELINKS = [FREEZE_PDP_TURMALIN, FREEZE_COLLECTION_GALAZKI] as const;

export const FREEZE_SEARCH_NEGATIVES_PHRASE = [
  'naprawa',
  'naprawki',
  'przeróbka',
  'lutowanie',
  'skracanie',
  'łańcuszek',
  'łańcuszki',
  'łańcuch',
  'zapięcie',
  'powiększenie',
  'zmniejszenie',
  'wymiana kamienia',
  'skup złota',
  'skup zlota',
  'lombard',
  'zegarek',
  'zegarmistrz',
  'bemoon',
  'elfjoy',
  'moora',
  'ambermark',
  'arquetta',
  'okontinuum',
  'kitulec',
  'blyskotliwie',
  'cameaconcept',
  'iceroyale',
  'jagg jewels',
  'jewelline',
  'kasia wojcik',
  // 2026-09-24 operator: shared Marki batch (also applied to Safety Filter - Marki)
  'kamyki moniki',
  'kamyki monika',
  'vintage',
  'używane',
  'uzywane',
  'second hand',
  'secondhand',
  'stare pierścionki',
  'brylanty używane',
  'komis',
  'allegro używane',
  'olx',
  'w starym stylu',
  'shambala',
  'bijou brigitte',
  'bijou mima',
  'lovrin',
  'jacek byczewski',
  'marieta żukowska',
  'andel',
  'azzurro',
  'bursztynowa galeria',
  'motyle biżuteria',
  'prana',
  'zultanite',
  'zultanit',
  'sułtanit',
  'biżuteria stal',
  'dystrybutor biżuterii',
];

const FORBIDDEN = [
  'jubiler',
  'jubiler wrocław',
  'jubiler wroclaw',
];

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

export function gate0ForbiddenList(): string[] {
  return [
    're-apply freeze (ads-freeze-apply dryRun=0)',
    'campaign goals mutate',
    'conversion action primary mutate',
    'bidding / budget change',
    'expand / expand-metal',
    'search-themes apply',
    'forest-utm live',
    'landings-off live',
    'search-utm apply',
    'G&Y publish',
    'budget / tCPA / Maximize conversion value',
    'Final URL expansion ON',
    'Recommendations Apply',
  ];
}

export function adsAccountFreezeBlocked(dryRun: boolean): {
  blocked: boolean;
  reason?: string;
} {
  if (dryRun || !ADS_ACCOUNT_FREEZE_ACTIVE) return { blocked: false };
  return {
    blocked: true,
    reason: `Ads account frozen until ${ADS_ACCOUNT_FREEZE_UNTIL}. See docs/working/ADS_ACCOUNT_FREEZE_2026-09-20.md. Operator must say "odmroź Ads" before live mutate.`,
  };
}

export async function applyAdsFreeze(
  env: AdsEnv,
  opts?: { dryRun?: boolean },
): Promise<Record<string, unknown>> {
  const dryRun = opts?.dryRun !== false;
  const freeze = adsAccountFreezeBlocked(dryRun);
  if (freeze.blocked) {
    return {
      ok: false,
      stage: 'frozen',
      error: freeze.reason,
      dryRun: false,
      willNotDo: gate0ForbiddenList(),
      freezeUntil: ADS_ACCOUNT_FREEZE_UNTIL,
    };
  }
  const customerId = adsCustomerId(env);
  const before = await auditAdsAccountChanges(env);

  const caSearch = await adsSearch(
    env,
    `
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.resource_name,
      conversion_action.primary_for_goal,
      conversion_action.include_in_conversions_metric,
      conversion_action.category,
      conversion_action.status
    FROM conversion_action
    WHERE conversion_action.status != 'REMOVED'
    LIMIT 200
  `.trim(),
  );
  if (!caSearch.ok) return { ok: false, stage: 'conversion_actions', error: caSearch.error };

  const goalSearch = await adsSearch(
    env,
    `
    SELECT
      campaign.id,
      campaign.name,
      campaign_conversion_goal.resource_name,
      campaign_conversion_goal.category,
      campaign_conversion_goal.origin,
      campaign_conversion_goal.biddable
    FROM campaign_conversion_goal
    WHERE campaign.name IN ('Epir_Forest-Dark', 'Search-27.04.2026')
      AND campaign.status != 'REMOVED'
    LIMIT 200
  `.trim(),
  );
  if (!goalSearch.ok) return { ok: false, stage: 'campaign_goals', error: goalSearch.error };

  const agSearch = await adsSearch(
    env,
    `
    SELECT
      asset_group.id,
      asset_group.name,
      asset_group.resource_name,
      asset_group.final_urls
    FROM asset_group
    WHERE campaign.name = 'Epir_Forest-Dark'
      AND asset_group.status != 'REMOVED'
    LIMIT 20
  `.trim(),
  );
  if (!agSearch.ok) return { ok: false, stage: 'asset_groups', error: agSearch.error };

  const negSearch = await adsSearch(
    env,
    `
    SELECT campaign_criterion.keyword.text, campaign.name
    FROM campaign_criterion
    WHERE campaign.name = 'Search-27.04.2026'
      AND campaign_criterion.negative = TRUE
      AND campaign_criterion.type = 'KEYWORD'
    LIMIT 500
  `.trim(),
  );
  if (!negSearch.ok) return { ok: false, stage: 'negatives', error: negSearch.error };

  const existingNeg = new Set(
    negSearch.results.map((r) =>
      str(pick(r, ['campaignCriterion', 'keyword', 'text'])).toLowerCase(),
    ),
  );

  const caUpdates: Array<{
    resourceName: string;
    name: string;
    primary: boolean;
    include: boolean;
  }> = [];
  const caSkippedAlreadyOk: string[] = [];
  for (const r of caSearch.results) {
    const name = str(pick(r, ['conversionAction', 'name']));
    const rn = str(pick(r, ['conversionAction', 'resourceName']));
    const cat = str(pick(r, ['conversionAction', 'category']));
    const currentPrimary = pick(r, ['conversionAction', 'primaryForGoal']) === true;
    const n = name.toLowerCase();
    if (!rn) continue;
    let desired: boolean | null = null;
    if (n.includes('begin checkout')) desired = false;
    else if (n === 'google shopping app purchase') desired = true;
    else if (cat === 'PURCHASE' && n.includes('purchase (1)')) desired = false;
    if (desired === null) continue;
    if (currentPrimary === desired) {
      caSkippedAlreadyOk.push(name);
      continue;
    }
    caUpdates.push({
      resourceName: rn,
      name,
      primary: desired,
      include: desired,
    });
  }

  const goalUpdates: Array<{
    resourceName: string;
    campaign: string;
    category: string;
    biddable: boolean;
  }> = [];
  for (const r of goalSearch.results) {
    const rn = str(pick(r, ['campaignConversionGoal', 'resourceName']));
    const category = str(pick(r, ['campaignConversionGoal', 'category']));
    const origin = str(pick(r, ['campaignConversionGoal', 'origin']));
    const campaign = str(pick(r, ['campaign', 'name']));
    const currentBiddable = pick(r, ['campaignConversionGoal', 'biddable']) === true;
    if (!rn) continue;
    const keep = category === 'PURCHASE' && origin === 'WEBSITE';
    if (currentBiddable === keep) continue;
    goalUpdates.push({ resourceName: rn, campaign, category: `${category}/${origin}`, biddable: keep });
  }

  const urlByAg: Record<string, string[]> = {
    EPIR_Srebro: [
      FREEZE_SILVER_COLLECTION,
      FREEZE_PDP_TURMALIN,
      FREEZE_COLLECTION_GALAZKI,
    ],
    EPIR_Zloto: [FREEZE_GOLD_COLLECTION],
  };
  const agUpdates: Array<{ resourceName: string; name: string; finalUrls: string[] }> = [];
  for (const r of agSearch.results) {
    const name = str(pick(r, ['assetGroup', 'name']));
    const rn = str(pick(r, ['assetGroup', 'resourceName']));
    const urls = urlByAg[name];
    if (urls && rn) agUpdates.push({ resourceName: rn, name, finalUrls: urls });
  }

  const keywordsToAdd = FREEZE_SEARCH_NEGATIVES_PHRASE.filter((k) => {
    const n = k.toLowerCase();
    if (FORBIDDEN.some((f) => n === f)) return false;
    return !existingNeg.has(n);
  });

  const plan = {
    dryRun,
    willNotDo: gate0ForbiddenList(),
    conversionActionUpdates: caUpdates,
    conversionActionsAlreadyOk: caSkippedAlreadyOk,
    campaignGoalUpdates: goalUpdates,
    assetGroupFinalUrls: agUpdates,
    searchNegativesPhrase: keywordsToAdd,
    skippedNegativesAlreadyPresent: FREEZE_SEARCH_NEGATIVES_PHRASE.filter((k) =>
      existingNeg.has(k.toLowerCase()),
    ),
  };

  if (dryRun) {
    return { ok: true, dryRun: true, before, plan };
  }

  const mutateResults: unknown[] = [];

  for (const u of caUpdates) {
    const mutated = await adsMutate(env, 'conversionActions:mutate', {
      operations: [
        {
          update: {
            resourceName: u.resourceName,
            primaryForGoal: u.primary,
          },
          updateMask: 'primaryForGoal',
        },
      ],
    });
    mutateResults.push({ kind: 'conversionAction', name: u.name, mutated });
    if (!mutated.ok) {
      const skip =
        mutated.error.includes('IMMUTABLE_FIELD') ||
        mutated.error.includes('MUTATE_NOT_ALLOWED');
      if (!skip) {
        return { ok: false, stage: 'mutate_ca', error: mutated.error, plan, mutateResults };
      }
    }
  }

  for (const u of goalUpdates) {
    const mutated = await adsMutate(env, 'campaignConversionGoals:mutate', {
      operations: [
        {
          update: {
            resourceName: u.resourceName,
            biddable: u.biddable,
          },
          updateMask: 'biddable',
        },
      ],
    });
    mutateResults.push({ kind: 'campaignGoal', ...u, mutated });
    if (!mutated.ok) return { ok: false, stage: 'mutate_goal', error: mutated.error, plan, mutateResults };
  }

  for (const u of agUpdates) {
    const mutated = await adsMutate(env, 'assetGroups:mutate', {
      operations: [
        {
          update: {
            resourceName: u.resourceName,
            finalUrls: u.finalUrls,
          },
          updateMask: 'finalUrls',
        },
      ],
    });
    mutateResults.push({ kind: 'assetGroup', name: u.name, mutated });
    if (!mutated.ok) return { ok: false, stage: 'mutate_ag', error: mutated.error, plan, mutateResults };
  }

  const searchCamp = `customers/${customerId}/campaigns/23801073253`;
  for (const keyword of keywordsToAdd) {
    const mutated = await adsMutate(env, 'campaignCriteria:mutate', {
      operations: [
        {
          create: {
            campaign: searchCamp,
            negative: true,
            keyword: { text: keyword, matchType: 'PHRASE' },
          },
        },
      ],
    });
    mutateResults.push({ kind: 'searchNegative', keyword, mutated });
    if (!mutated.ok) return { ok: false, stage: 'mutate_neg', error: mutated.error, plan, mutateResults };
  }

  const after = await auditAdsAccountChanges(env);
  return { ok: true, dryRun: false, plan, mutateResults, after };
}
