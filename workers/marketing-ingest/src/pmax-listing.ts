/**
 * PMax listing groups audit + expand for Tor Apex (Epir_Forest-Dark).
 * Target tree per asset group:
 *   ROOT SUBDIVISION (brand)
 *     → UNIT_EXCLUDED brand Kazka
 *     → SUBDIVISION other brands → custom_label_2:
 *         UNIT_INCLUDED Srebro | UNIT_INCLUDED Zloto | UNIT_EXCLUDED rest
 */
import type { AdsEnv } from './ads';
import { adsCustomerId, adsMutate, adsSearch, type GaqlRow } from './ads-api';

export const DEFAULT_PMAX_CAMPAIGN = 'Epir_Forest-Dark';
export const EXCLUDE_BRAND = 'Kazka';
export const METAL_LABEL_INDEX = 'INDEX2';
export const SILVER_LABEL = 'Srebro';
export const GOLD_LABEL = 'Zloto';
export const FOREST_UTM_SUFFIX =
  'utm_source=google&utm_medium=cpc&utm_campaign=forest_premium';

export type ListingFilterNode = {
  resourceName: string;
  type: string;
  listingSource: string;
  parent: string | null;
  assetGroupId: string;
  assetGroupName: string;
  campaignId: string;
  campaignName: string;
  productBrand: string | null;
  productItemId: string | null;
  productType: string | null;
  productCustomAttribute: string | null;
  productCustomAttributeIndex: string | null;
  vertical: string | null;
};

export type PmaxListingAudit = {
  campaignName: string;
  customerId: string;
  assetGroups: Array<{
    id: string;
    name: string;
    filters: ListingFilterNode[];
    includedCount: number;
    excludedCount: number;
    subdivisionCount: number;
  }>;
  totals: { included: number; excluded: number; subdivision: number; filters: number };
  interpretation: string;
  targetContract: {
    included: string;
    excludedBrand: string;
    metalLabels: string[];
    customLabelIndex: string;
    utmCampaign: string;
    landing: string;
  };
};

function pick(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function parseFilterRow(row: GaqlRow): ListingFilterNode {
  const f = (row.assetGroupListingGroupFilter ?? {}) as Record<string, unknown>;
  const caseValue = (f.caseValue ?? {}) as Record<string, unknown>;
  const brand = pick(caseValue, ['productBrand', 'value']);
  const itemId = pick(caseValue, ['productItemId', 'value']);
  const productType = pick(caseValue, ['productType', 'value']);
  const customAttr = pick(caseValue, ['productCustomAttribute', 'value']);
  const customIndex = pick(caseValue, ['productCustomAttribute', 'index']);
  const ag = (row.assetGroup ?? {}) as Record<string, unknown>;
  const camp = (row.campaign ?? {}) as Record<string, unknown>;
  return {
    resourceName: str(f.resourceName) ?? '',
    type: str(f.type) ?? '',
    listingSource: str(f.listingSource) ?? '',
    parent: str(f.parentListingGroupFilter),
    assetGroupId: str(ag.id) ?? '',
    assetGroupName: str(ag.name) ?? '',
    campaignId: str(camp.id) ?? '',
    campaignName: str(camp.name) ?? '',
    productBrand: str(brand),
    productItemId: str(itemId),
    productType: str(productType),
    productCustomAttribute: str(customAttr),
    productCustomAttributeIndex: str(customIndex),
    vertical: str(f.vertical),
  };
}

function interpret(totals: PmaxListingAudit['totals'], filters: ListingFilterNode[]): string {
  if (totals.filters === 0) {
    return 'Brak listing group filters — PMax może brać cały feed Shopping (sprawdź GMC).';
  }
  const metalIncludes = filters.filter((f) => {
    if (!f.type.includes('INCLUDED')) return false;
    const v = (f.productCustomAttribute ?? '').toLowerCase();
    return v === 'srebro' || v === 'zloto';
  });
  const kazkaExclude = filters.some(
    (f) =>
      f.type.includes('EXCLUDED') &&
      (f.productBrand ?? '').toLowerCase() === 'kazka',
  );
  if (metalIncludes.length >= 2 && kazkaExclude) {
    return `Docelowy kontrakt: EXCLUDE Kazka + INCLUDE custom_label_2 ${SILVER_LABEL}/${GOLD_LABEL} (${metalIncludes.length} węzłów metalu).`;
  }
  const itemIncludes = filters.filter(
    (f) => f.type.includes('INCLUDED') && f.productItemId,
  );
  if (itemIncludes.length > 0 && itemIncludes.length <= 50 && totals.excluded > totals.included) {
    return `Wąski zestaw: ${itemIncludes.length} UNIT_INCLUDED po item ID; większość katalogu w EXCLUDED — wymaga expand do Srebro/Zloto.`;
  }
  if (kazkaExclude && !metalIncludes.length) {
    return 'Brand Kazka w EXCLUDED, ale brak gałęzi Srebro/Zloto — częściowy układ.';
  }
  if (totals.excluded >= totals.included * 10) {
    return 'Dominują wykluczenia (~99% feedu poza aukcją) — wymaga przebudowy drzewa pod EPIR Srebro/Zloto.';
  }
  return `Filtry: included=${totals.included}, excluded=${totals.excluded}, subdivision=${totals.subdivision}.`;
}

function depthScore(node: ListingFilterNode, byRn: Map<string, ListingFilterNode>): number {
  let d = 0;
  let cur: ListingFilterNode | undefined = node;
  const seen = new Set<string>();
  while (cur?.parent) {
    if (seen.has(cur.parent)) break;
    seen.add(cur.parent);
    d += 1;
    cur = byRn.get(cur.parent);
  }
  return d;
}

/** Build create ops for EPIR metal tree (temporary resource names: assetGroupId~-N). */
export function buildMetalListingCreateOps(
  customerId: string,
  assetGroupId: string,
  excludeBrand = EXCLUDE_BRAND,
): unknown[] {
  const assetGroupResource = `customers/${customerId}/assetGroups/${assetGroupId}`;
  const filterRn = (tempId: number) =>
    `customers/${customerId}/assetGroupListingGroupFilters/${assetGroupId}~${tempId}`;

  const rootTemp = filterRn(-1);
  const excludeKazkaTemp = filterRn(-2);
  const metalSplitTemp = filterRn(-3);
  const silverTemp = filterRn(-4);
  const goldTemp = filterRn(-5);
  const restTemp = filterRn(-6);

  return [
    {
      create: {
        resourceName: rootTemp,
        assetGroup: assetGroupResource,
        type: 'SUBDIVISION',
        listingSource: 'SHOPPING',
      },
    },
    {
      create: {
        resourceName: excludeKazkaTemp,
        assetGroup: assetGroupResource,
        type: 'UNIT_EXCLUDED',
        listingSource: 'SHOPPING',
        parentListingGroupFilter: rootTemp,
        caseValue: { productBrand: { value: excludeBrand } },
      },
    },
    {
      create: {
        resourceName: metalSplitTemp,
        assetGroup: assetGroupResource,
        type: 'SUBDIVISION',
        listingSource: 'SHOPPING',
        parentListingGroupFilter: rootTemp,
        caseValue: { productBrand: {} },
      },
    },
    {
      create: {
        resourceName: silverTemp,
        assetGroup: assetGroupResource,
        type: 'UNIT_INCLUDED',
        listingSource: 'SHOPPING',
        parentListingGroupFilter: metalSplitTemp,
        caseValue: {
          productCustomAttribute: { index: METAL_LABEL_INDEX, value: SILVER_LABEL },
        },
      },
    },
    {
      create: {
        resourceName: goldTemp,
        assetGroup: assetGroupResource,
        type: 'UNIT_INCLUDED',
        listingSource: 'SHOPPING',
        parentListingGroupFilter: metalSplitTemp,
        caseValue: {
          productCustomAttribute: { index: METAL_LABEL_INDEX, value: GOLD_LABEL },
        },
      },
    },
    {
      create: {
        resourceName: restTemp,
        assetGroup: assetGroupResource,
        type: 'UNIT_EXCLUDED',
        listingSource: 'SHOPPING',
        parentListingGroupFilter: metalSplitTemp,
        caseValue: {
          productCustomAttribute: { index: METAL_LABEL_INDEX },
        },
      },
    },
  ];
}

/**
 * Create EPIR metal listing tree in one GoogleAdsService.Mutate call
 * (SUBDIVISION requires everything-else child in the same request).
 */
async function createMetalListingTree(
  env: AdsEnv,
  customerId: string,
  assetGroupId: string,
  excludeBrand: string,
): Promise<{ ok: true; created: string[] } | { ok: false; error: string; created: string[] }> {
  const assetGroupResource = `customers/${customerId}/assetGroups/${assetGroupId}`;
  const filterRn = (tempId: number) =>
    `customers/${customerId}/assetGroupListingGroupFilters/${assetGroupId}~${tempId}`;

  const rootTemp = filterRn(-1);
  const excludeKazkaTemp = filterRn(-2);
  const metalSplitTemp = filterRn(-3);
  const silverTemp = filterRn(-4);
  const goldTemp = filterRn(-5);
  const restTemp = filterRn(-6);

  const creates = [
    {
      resourceName: rootTemp,
      assetGroup: assetGroupResource,
      type: 'SUBDIVISION',
      listingSource: 'SHOPPING',
    },
    {
      resourceName: excludeKazkaTemp,
      assetGroup: assetGroupResource,
      type: 'UNIT_EXCLUDED',
      listingSource: 'SHOPPING',
      parentListingGroupFilter: rootTemp,
      caseValue: { productBrand: { value: excludeBrand } },
    },
    {
      resourceName: metalSplitTemp,
      assetGroup: assetGroupResource,
      type: 'SUBDIVISION',
      listingSource: 'SHOPPING',
      parentListingGroupFilter: rootTemp,
      caseValue: { productBrand: {} },
    },
    {
      resourceName: silverTemp,
      assetGroup: assetGroupResource,
      type: 'UNIT_INCLUDED',
      listingSource: 'SHOPPING',
      parentListingGroupFilter: metalSplitTemp,
      caseValue: {
        productCustomAttribute: { index: METAL_LABEL_INDEX, value: SILVER_LABEL },
      },
    },
    {
      resourceName: goldTemp,
      assetGroup: assetGroupResource,
      type: 'UNIT_INCLUDED',
      listingSource: 'SHOPPING',
      parentListingGroupFilter: metalSplitTemp,
      caseValue: {
        productCustomAttribute: { index: METAL_LABEL_INDEX, value: GOLD_LABEL },
      },
    },
    {
      resourceName: restTemp,
      assetGroup: assetGroupResource,
      type: 'UNIT_EXCLUDED',
      listingSource: 'SHOPPING',
      parentListingGroupFilter: metalSplitTemp,
      caseValue: {
        productCustomAttribute: { index: METAL_LABEL_INDEX },
      },
    },
  ];

  const mutateOperations = creates.map((create) => ({
    assetGroupListingGroupFilterOperation: { create },
  }));

  const res = await adsMutate(env, 'googleAds:mutate', { mutateOperations });
  if (!res.ok) return { ok: false, error: res.error, created: [] };

  const results = (res.data as { mutateOperationResponses?: Array<{ assetGroupListingGroupFilterResult?: { resourceName?: string } }> })
    ?.mutateOperationResponses;
  const created = (results ?? [])
    .map((r) => r.assetGroupListingGroupFilterResult?.resourceName)
    .filter((rn): rn is string => Boolean(rn));

  return { ok: true, created };
}

export async function auditPmaxListingGroups(
  env: AdsEnv,
  campaignName = DEFAULT_PMAX_CAMPAIGN,
): Promise<PmaxListingAudit | { error: string }> {
  const customerId = adsCustomerId(env);
  if (!customerId) return { error: 'GOOGLE_ADS_CUSTOMER_ID missing' };

  const escaped = campaignName.replace(/'/g, "\\'");
  const query = `
    SELECT
      asset_group_listing_group_filter.resource_name,
      asset_group_listing_group_filter.type,
      asset_group_listing_group_filter.listing_source,
      asset_group_listing_group_filter.parent_listing_group_filter,
      asset_group_listing_group_filter.case_value.product_brand.value,
      asset_group_listing_group_filter.case_value.product_item_id.value,
      asset_group_listing_group_filter.case_value.product_type.value,
      asset_group_listing_group_filter.case_value.product_custom_attribute.value,
      asset_group_listing_group_filter.case_value.product_custom_attribute.index,
      asset_group.id,
      asset_group.name,
      campaign.id,
      campaign.name
    FROM asset_group_listing_group_filter
    WHERE campaign.name = '${escaped}'
    LIMIT 10000
  `.trim();

  const search = await adsSearch(env, query);
  if (!search.ok) return { error: search.error };

  const filters = search.results.map(parseFilterRow);
  const byAg = new Map<string, ListingFilterNode[]>();
  for (const f of filters) {
    const key = f.assetGroupId || 'unknown';
    const list = byAg.get(key) ?? [];
    list.push(f);
    byAg.set(key, list);
  }

  const assetGroups = [...byAg.entries()].map(([id, list]) => {
    const includedCount = list.filter((f) => f.type.includes('INCLUDED')).length;
    const excludedCount = list.filter((f) => f.type.includes('EXCLUDED')).length;
    const subdivisionCount = list.filter((f) => f.type.includes('SUBDIVISION')).length;
    return {
      id,
      name: list[0]?.assetGroupName ?? '',
      filters: list,
      includedCount,
      excludedCount,
      subdivisionCount,
    };
  });

  const totals = {
    included: filters.filter((f) => f.type.includes('INCLUDED')).length,
    excluded: filters.filter((f) => f.type.includes('EXCLUDED')).length,
    subdivision: filters.filter((f) => f.type.includes('SUBDIVISION')).length,
    filters: filters.length,
  };

  return {
    campaignName,
    customerId,
    assetGroups,
    totals,
    interpretation: interpret(totals, filters),
    targetContract: {
      included: `GMC EPIR: nowy-szablon|pierscionek-zloto-turmali + G&YT + Online Store; listing: ${SILVER_LABEL}+${GOLD_LABEL} (custom_label_2)`,
      excludedBrand: EXCLUDE_BRAND,
      metalLabels: [SILVER_LABEL, GOLD_LABEL],
      customLabelIndex: METAL_LABEL_INDEX,
      utmCampaign: 'forest_premium',
      landing: 'forest-premium-landing',
    },
  };
}

/**
 * Replace listing group tree for each asset group:
 * ROOT brand → EXCLUDE Kazka + SUBDIVISION other → INCLUDE Srebro/Zloto + EXCLUDE rest.
 */
export async function expandPmaxListingGroups(
  env: AdsEnv,
  opts?: { campaignName?: string; dryRun?: boolean; excludeBrand?: string },
): Promise<Record<string, unknown>> {
  const campaignName = opts?.campaignName ?? DEFAULT_PMAX_CAMPAIGN;
  const dryRun = opts?.dryRun === true;
  const excludeBrand = opts?.excludeBrand ?? EXCLUDE_BRAND;

  const audit = await auditPmaxListingGroups(env, campaignName);
  if ('error' in audit) return { ok: false, error: audit.error };

  const customerId = adsCustomerId(env);
  const results: unknown[] = [];

  async function applyForAssetGroup(
    agId: string,
    agName: string,
    existingFilters: ListingFilterNode[],
  ): Promise<void> {
    const byRn = new Map(existingFilters.map((f) => [f.resourceName, f]));
    const sortedRemove = [...existingFilters].sort(
      (a, b) => depthScore(b, byRn) - depthScore(a, byRn),
    );
    const removeOps = sortedRemove
      .filter((f) => f.resourceName)
      .map((f) => ({ remove: f.resourceName }));
    const createOpsPreview = buildMetalListingCreateOps(customerId, agId, excludeBrand);

    if (dryRun) {
      results.push({
        assetGroupId: agId,
        assetGroupName: agName,
        dryRun: true,
        removeCount: removeOps.length,
        createCount: createOpsPreview.length,
        operationsPreview: [...removeOps, ...createOpsPreview],
        note: 'Live expand uses sequential creates (no temp resource names).',
      });
      return;
    }

    // Phase 1: remove existing tree
    let removeMutate: unknown = null;
    if (removeOps.length) {
      removeMutate = await adsMutate(env, 'assetGroupListingGroupFilters:mutate', {
        operations: removeOps,
      });
      if (!(removeMutate as { ok?: boolean }).ok) {
        results.push({
          assetGroupId: agId,
          assetGroupName: agName,
          phase: 'remove',
          mutate: removeMutate,
        });
        return;
      }
    }

    // Phase 2: sequential create (real parent resource names)
    const createRes = await createMetalListingTree(env, customerId, agId, excludeBrand);
    results.push({
      assetGroupId: agId,
      assetGroupName: agName,
      phase: 'create',
      removeMutate,
      mutate: createRes,
    });
  }

  for (const ag of audit.assetGroups) {
    if (!ag.id) continue;
    await applyForAssetGroup(ag.id, ag.name, ag.filters);
  }

  // If campaign had zero filters (empty tree), create for all asset groups of campaign
  if (audit.assetGroups.length === 0) {
    const agSearch = await adsSearch(
      env,
      `
      SELECT asset_group.id, asset_group.name, campaign.name
      FROM asset_group
      WHERE campaign.name = '${campaignName.replace(/'/g, "\\'")}'
      LIMIT 50
    `.trim(),
    );
    if (!agSearch.ok) return { ok: false, error: agSearch.error, audit };
    for (const row of agSearch.results) {
      const ag = row.assetGroup as { id?: string; name?: string } | undefined;
      if (!ag?.id) continue;
      await applyForAssetGroup(String(ag.id), String(ag.name ?? ''), []);
    }
  }

  const after = dryRun ? null : await auditPmaxListingGroups(env, campaignName);

  return {
    ok: true,
    dryRun,
    campaignName,
    excludeBrand,
    metalLabels: [SILVER_LABEL, GOLD_LABEL],
    customLabelIndex: METAL_LABEL_INDEX,
    before: {
      totals: audit.totals,
      interpretation: audit.interpretation,
      assetGroupCount: audit.assetGroups.length,
    },
    results,
    after,
  };
}

export async function setCampaignFinalUrlSuffix(
  env: AdsEnv,
  opts: { campaignName: string; finalUrlSuffix: string; dryRun?: boolean },
): Promise<Record<string, unknown>> {
  const escaped = opts.campaignName.replace(/'/g, "\\'");
  const search = await adsSearch(
    env,
    `
    SELECT campaign.id, campaign.name, campaign.final_url_suffix, campaign.resource_name
    FROM campaign
    WHERE campaign.name = '${escaped}'
    LIMIT 5
  `.trim(),
  );
  if (!search.ok) return { ok: false, error: search.error };
  if (!search.results.length) {
    return { ok: false, error: `campaign not found: ${opts.campaignName}` };
  }
  const camp = search.results[0].campaign as {
    id?: string;
    name?: string;
    finalUrlSuffix?: string;
    resourceName?: string;
  };
  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      campaignId: camp.id,
      campaignName: camp.name,
      currentSuffix: camp.finalUrlSuffix ?? '',
      nextSuffix: opts.finalUrlSuffix,
    };
  }
  const customerId = adsCustomerId(env);
  const resourceName =
    camp.resourceName ?? `customers/${customerId}/campaigns/${camp.id}`;
  const mutated = await adsMutate(env, 'campaigns:mutate', {
    operations: [
      {
        update: {
          resourceName,
          finalUrlSuffix: opts.finalUrlSuffix,
        },
        updateMask: 'finalUrlSuffix',
      },
    ],
  });
  return {
    ok: mutated.ok,
    campaignId: camp.id,
    campaignName: camp.name,
    previousSuffix: camp.finalUrlSuffix ?? '',
    nextSuffix: opts.finalUrlSuffix,
    mutate: mutated,
  };
}

export type SearchAdGroupUtmPlan = {
  adGroupId: string;
  adGroupName: string;
  currentSuffix: string;
  nextSuffix: string;
  utmCampaign: string;
};

/** Map Search ad groups → UTM keys by name heuristics. */
export function planSearchAdGroupSuffixes(
  adGroups: Array<{ id: string; name: string; finalUrlSuffix?: string }>,
): SearchAdGroupUtmPlan[] {
  const plans: SearchAdGroupUtmPlan[] = [];
  for (const ag of adGroups) {
    const n = ag.name.toLowerCase();
    let key = 'organic_art';
    if (
      n.includes('pierścion') ||
      n.includes('pierscion') ||
      n.includes('ring') ||
      n.includes('obrącz') ||
      n.includes('obracz')
    ) {
      key = 'artisan_rings';
    } else if (n.includes('nowoś') || n.includes('nowosc') || n.includes('new')) {
      key = 'artisan_new';
    } else if (
      n.includes('organic') ||
      n.includes('artyst') ||
      n.includes('biżuter') ||
      n.includes('bizuter') ||
      n.includes('wieczno') ||
      n.includes('gałązk') ||
      n.includes('galazk')
    ) {
      key = 'organic_art';
    }
    const nextSuffix = `utm_source=google&utm_medium=cpc&utm_campaign=${key}&utm_term={keyword}`;
    plans.push({
      adGroupId: ag.id,
      adGroupName: ag.name,
      currentSuffix: ag.finalUrlSuffix ?? '',
      nextSuffix,
      utmCampaign: key,
    });
  }
  return plans;
}

export async function applySearchAdGroupUtmSuffixes(
  env: AdsEnv,
  opts?: { campaignName?: string; dryRun?: boolean },
): Promise<Record<string, unknown>> {
  const dryRun = opts?.dryRun === true;
  const search = await adsSearch(
    env,
    `
    SELECT ad_group.id, ad_group.name, ad_group.final_url_suffix, ad_group.resource_name, campaign.name
    FROM ad_group
    WHERE campaign.name LIKE '%27.04.2026%'
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
    LIMIT 100
  `.trim(),
  );
  if (!search.ok) return { ok: false, error: search.error };

  const adGroups = search.results.map((row) => {
    const ag = row.adGroup as {
      id?: string;
      name?: string;
      finalUrlSuffix?: string;
      resourceName?: string;
    };
    return {
      id: String(ag.id ?? ''),
      name: String(ag.name ?? ''),
      finalUrlSuffix: ag.finalUrlSuffix,
      resourceName: ag.resourceName,
      campaignName: String((row.campaign as { name?: string })?.name ?? ''),
    };
  });

  const plans = planSearchAdGroupSuffixes(adGroups);
  if (dryRun) {
    return { ok: true, dryRun: true, campaignFilter: '%27.04.2026%', adGroups, plans };
  }

  const customerId = adsCustomerId(env);
  const mutateResults: unknown[] = [];
  for (const plan of plans) {
    const resourceName =
      adGroups.find((a) => a.id === plan.adGroupId)?.resourceName ??
      `customers/${customerId}/adGroups/${plan.adGroupId}`;
    const mutated = await adsMutate(env, 'adGroups:mutate', {
      operations: [
        {
          update: {
            resourceName,
            finalUrlSuffix: plan.nextSuffix,
          },
          updateMask: 'finalUrlSuffix',
        },
      ],
    });
    mutateResults.push({ plan, mutate: mutated });
  }
  return { ok: true, dryRun: false, plans, mutateResults };
}
