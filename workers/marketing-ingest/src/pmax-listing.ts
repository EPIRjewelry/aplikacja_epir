/**
 * PMax listing groups audit + expand for Tor Apex (Epir_Forest-Dark).
 *
 * Dual-metal tree (legacy expand):
 *   ROOT SUBDIVISION (brand)
 *     → UNIT_EXCLUDED brand Kazka
 *     → SUBDIVISION other brands → custom_label_2:
 *         UNIT_INCLUDED Srebro | UNIT_INCLUDED Zloto | UNIT_EXCLUDED rest
 *
 * Single-metal tree (preferred per asset group):
 *   ROOT SUBDIVISION (brand)
 *     → UNIT_EXCLUDED brand Kazka
 *     → SUBDIVISION other brands → custom_label_2:
 *         UNIT_INCLUDED <Srebro|Zloto> | UNIT_EXCLUDED rest
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

export type MetalLabel = typeof SILVER_LABEL | typeof GOLD_LABEL;

export function parseMetalLabel(raw: string | null | undefined): MetalLabel | null {
  const n = String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (n === 'srebro') return SILVER_LABEL;
  if (n === 'zloto') return GOLD_LABEL;
  return null;
}

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
    status?: string | null;
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
  if (metalIncludes.length === 1 && kazkaExclude) {
    const label = metalIncludes[0]?.productCustomAttribute ?? '?';
    return `Kontrakt single-metal: EXCLUDE Kazka + INCLUDE custom_label_2 ${label}.`;
  }
  if (metalIncludes.length >= 2 && kazkaExclude) {
    return `Kontrakt dual-metal (legacy): EXCLUDE Kazka + INCLUDE custom_label_2 ${SILVER_LABEL}/${GOLD_LABEL} (${metalIncludes.length} węzłów metalu).`;
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

/** Build create ops for single-metal EPIR tree (temporary resource names). */
export function buildSingleMetalListingCreateOps(
  customerId: string,
  assetGroupId: string,
  metal: MetalLabel,
  excludeBrand = EXCLUDE_BRAND,
): unknown[] {
  const assetGroupResource = `customers/${customerId}/assetGroups/${assetGroupId}`;
  const filterRn = (tempId: number) =>
    `customers/${customerId}/assetGroupListingGroupFilters/${assetGroupId}~${tempId}`;

  const rootTemp = filterRn(-1);
  const excludeKazkaTemp = filterRn(-2);
  const metalSplitTemp = filterRn(-3);
  const includeMetalTemp = filterRn(-4);
  const restTemp = filterRn(-5);

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
        resourceName: includeMetalTemp,
        assetGroup: assetGroupResource,
        type: 'UNIT_INCLUDED',
        listingSource: 'SHOPPING',
        parentListingGroupFilter: metalSplitTemp,
        caseValue: {
          productCustomAttribute: { index: METAL_LABEL_INDEX, value: metal },
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

async function createSingleMetalListingTree(
  env: AdsEnv,
  customerId: string,
  assetGroupId: string,
  metal: MetalLabel,
  excludeBrand: string,
): Promise<{ ok: true; created: string[] } | { ok: false; error: string; created: string[] }> {
  const assetGroupResource = `customers/${customerId}/assetGroups/${assetGroupId}`;
  const filterRn = (tempId: number) =>
    `customers/${customerId}/assetGroupListingGroupFilters/${assetGroupId}~${tempId}`;

  const rootTemp = filterRn(-1);
  const excludeKazkaTemp = filterRn(-2);
  const metalSplitTemp = filterRn(-3);
  const includeMetalTemp = filterRn(-4);
  const restTemp = filterRn(-5);

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
      resourceName: includeMetalTemp,
      assetGroup: assetGroupResource,
      type: 'UNIT_INCLUDED',
      listingSource: 'SHOPPING',
      parentListingGroupFilter: metalSplitTemp,
      caseValue: {
        productCustomAttribute: { index: METAL_LABEL_INDEX, value: metal },
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

  const results = (
    res.data as {
      mutateOperationResponses?: Array<{
        assetGroupListingGroupFilterResult?: { resourceName?: string };
      }>;
    }
  )?.mutateOperationResponses;
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

  const filtersAll = search.results.map(parseFilterRow);

  // Drop orphan filters belonging to REMOVED asset groups.
  const agStatusSearch = await adsSearch(
    env,
    `
    SELECT asset_group.id, asset_group.name, asset_group.status
    FROM asset_group
    WHERE campaign.name = '${escaped}'
    LIMIT 50
  `.trim(),
  );
  const removedIds = new Set<string>();
  const statusById = new Map<string, string>();
  if (agStatusSearch.ok) {
    for (const row of agStatusSearch.results) {
      const ag = row.assetGroup as { id?: string; status?: string };
      const id = String(ag.id ?? '');
      const status = String(ag.status ?? '');
      if (id) statusById.set(id, status);
      if (id && status === 'REMOVED') removedIds.add(id);
    }
  }
  const filters = filtersAll.filter((f) => !removedIds.has(f.assetGroupId));

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
      status: statusById.get(id) ?? null,
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
 * Count Merchant Center products visible to Ads (shopping_product),
 * broken down by status + custom_label_2 (INDEX2) for PMax listing filters.
 * IMPORTANT: Ads returns one row per (item_id × feed_label × language × channel) —
 * we always report unique item_id counts, not raw row counts.
 */
export async function countShoppingProductsForPmax(
  env: AdsEnv,
  opts?: { campaignName?: string },
): Promise<Record<string, unknown>> {
  const customerId = adsCustomerId(env);
  if (!customerId) return { ok: false, error: 'GOOGLE_ADS_CUSTOMER_ID missing' };

  const campaignName = opts?.campaignName ?? DEFAULT_PMAX_CAMPAIGN;
  const query = `
    SELECT
      shopping_product.item_id,
      shopping_product.status,
      shopping_product.availability,
      shopping_product.brand,
      shopping_product.custom_attribute2,
      shopping_product.title,
      shopping_product.feed_label,
      shopping_product.language_code,
      shopping_product.channel
    FROM shopping_product
    LIMIT 50000
  `.trim();

  const search = await adsSearch(env, query);
  if (!search.ok) return { ok: false, error: search.error, customerId, campaignName };

  type SpRow = {
    itemId?: string;
    status?: string;
    availability?: string;
    brand?: string;
    customAttribute2?: string;
    title?: string;
    feedLabel?: string;
    languageCode?: string;
    channel?: string;
  };

  const byFeedLabel: Record<string, number> = {};
  const byLanguage: Record<string, number> = {};
  const byChannel: Record<string, number> = {};

  /** Best row per item_id: prefer ELIGIBLE > ELIGIBLE_LIMITED > other; prefer IN_STOCK. */
  const statusRank = (s: string) => {
    if (s === 'ELIGIBLE') return 3;
    if (s === 'ELIGIBLE_LIMITED') return 2;
    if (s === 'NOT_ELIGIBLE') return 1;
    return 0;
  };
  const availRank = (a: string) => {
    const x = a.toLowerCase().replace(/_/g, ' ');
    if (x.includes('in stock')) return 2;
    if (x.includes('preorder')) return 1;
    return 0;
  };

  const bestByItem = new Map<string, SpRow>();
  for (const row of search.results) {
    const sp = (row.shoppingProduct ?? row.shopping_product ?? {}) as SpRow;
    const itemId = String(sp.itemId ?? '').trim();
    if (!itemId) continue;

    const fl = String(sp.feedLabel ?? '(empty)');
    const lang = String(sp.languageCode ?? '(empty)');
    const ch = String(sp.channel ?? '(empty)');
    byFeedLabel[fl] = (byFeedLabel[fl] ?? 0) + 1;
    byLanguage[lang] = (byLanguage[lang] ?? 0) + 1;
    byChannel[ch] = (byChannel[ch] ?? 0) + 1;

    const prev = bestByItem.get(itemId);
    if (!prev) {
      bestByItem.set(itemId, sp);
      continue;
    }
    const prevScore =
      statusRank(String(prev.status ?? '')) * 10 + availRank(String(prev.availability ?? ''));
    const nextScore =
      statusRank(String(sp.status ?? '')) * 10 + availRank(String(sp.availability ?? ''));
    if (nextScore > prevScore) bestByItem.set(itemId, sp);
  }

  const byStatus: Record<string, number> = {};
  const byMetal: Record<string, number> = {};
  const byAvail: Record<string, number> = {};
  const byBrand: Record<string, number> = {};
  let pmaxEligibleMetal = 0;
  let pmaxEligibleMetalLive = 0;
  let kazkaBrand = 0;
  let eligibleUnique = 0;
  let eligibleLimitedUnique = 0;
  let notEligibleUnique = 0;

  for (const sp of bestByItem.values()) {
    const status = String(sp.status ?? 'UNKNOWN');
    const avail = String(sp.availability ?? 'UNKNOWN');
    const brand = String(sp.brand ?? '').trim();
    const metalRaw = String(sp.customAttribute2 ?? '').trim();
    const metal = metalRaw || '(empty)';

    byStatus[status] = (byStatus[status] ?? 0) + 1;
    byMetal[metal] = (byMetal[metal] ?? 0) + 1;
    byAvail[avail] = (byAvail[avail] ?? 0) + 1;
    const brandKey = brand || '(empty)';
    byBrand[brandKey] = (byBrand[brandKey] ?? 0) + 1;

    if (status === 'ELIGIBLE') eligibleUnique += 1;
    else if (status === 'ELIGIBLE_LIMITED') eligibleLimitedUnique += 1;
    else if (status === 'NOT_ELIGIBLE') notEligibleUnique += 1;

    const brandLower = brand.toLowerCase();
    if (brandLower === 'kazka') {
      kazkaBrand += 1;
      continue;
    }

    const metalNorm = metalRaw.toLowerCase();
    const isMetal =
      metalNorm === 'srebro' ||
      metalNorm === 'zloto' ||
      metalNorm === 'złoto';
    if (!isMetal) continue;

    pmaxEligibleMetal += 1;
    const availLower = avail.toLowerCase().replace(/_/g, ' ');
    if (
      availLower.includes('in stock') ||
      availLower.includes('preorder') ||
      availLower === 'in_stock' ||
      availLower === 'preorder'
    ) {
      pmaxEligibleMetalLive += 1;
    }
  }

  // Products with impressions in PMax last 7 days (actually serving).
  const escaped = campaignName.replace(/'/g, "\\'");
  const perfQuery = `
    SELECT
      segments.product_item_id,
      metrics.impressions,
      campaign.name
    FROM shopping_performance_view
    WHERE segments.date DURING LAST_7_DAYS
      AND campaign.name = '${escaped}'
      AND metrics.impressions > 0
    LIMIT 50000
  `.trim();
  const perf = await adsSearch(env, perfQuery);
  const servingItemIds = new Set<string>();
  if (perf.ok) {
    for (const row of perf.results) {
      const segments = (row.segments ?? {}) as { productItemId?: string };
      const itemId = String(segments.productItemId ?? '').trim();
      if (itemId) servingItemIds.add(itemId);
    }
  }

  return {
    ok: true,
    customerId,
    campaignName,
    note: 'unique* = dedupe po shopping_product.item_id (Ads zwraca wiersze per feed_label/język/kanał)',
    rawRows: search.results.length,
    uniqueItemIds: bestByItem.size,
    byStatusUnique: byStatus,
    eligibleUnique,
    eligibleLimitedUnique,
    notEligibleUnique,
    byMetalUnique: byMetal,
    byAvailabilityUnique: byAvail,
    byBrandTopUnique: Object.fromEntries(
      Object.entries(byBrand)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15),
    ),
    dimensionsRawRows: {
      byFeedLabel,
      byLanguage,
      byChannel,
    },
    listingContractApprox: {
      note: 'Filtr PMax: EXCLUDE brand Kazka + INCLUDE custom_label_2 Srebro|Zloto (unique item_id)',
      uniqueMatchingMetalNotKazka: pmaxEligibleMetal,
      uniqueMatchingMetalNotKazkaInStockOrPreorder: pmaxEligibleMetalLive,
      kazkaBrandExcluded: kazkaBrand,
    },
    servingLast7Days: {
      ok: perf.ok,
      error: perf.ok ? undefined : perf.error,
      uniqueProductsWithImpressions: servingItemIds.size,
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

/**
 * Replace listing group tree for ONE asset group with single-metal INCLUDE.
 * Prefer this over dual-metal expand when running EPIR_Srebro / EPIR_Zloto split.
 */
export async function expandPmaxListingGroupsSingleMetal(
  env: AdsEnv,
  opts: {
    campaignName?: string;
    assetGroupName: string;
    metal: MetalLabel | string;
    dryRun?: boolean;
    excludeBrand?: string;
  },
): Promise<Record<string, unknown>> {
  const campaignName = opts.campaignName ?? DEFAULT_PMAX_CAMPAIGN;
  const dryRun = opts.dryRun === true;
  const excludeBrand = opts.excludeBrand ?? EXCLUDE_BRAND;
  const metal = parseMetalLabel(opts.metal);
  if (!metal) {
    return {
      ok: false,
      error: `invalid metal "${opts.metal}" — expected Srebro or Zloto`,
    };
  }
  const assetGroupName = opts.assetGroupName?.trim();
  if (!assetGroupName) {
    return { ok: false, error: 'assetGroupName required' };
  }

  const audit = await auditPmaxListingGroups(env, campaignName);
  if ('error' in audit) return { ok: false, error: audit.error };

  const customerId = adsCustomerId(env);
  let target = audit.assetGroups.find(
    (ag) => ag.name.toLowerCase() === assetGroupName.toLowerCase(),
  );

  if (!target) {
    const escapedCampaign = campaignName.replace(/'/g, "\\'");
    const escapedAg = assetGroupName.replace(/'/g, "\\'");
    const agSearch = await adsSearch(
      env,
      `
      SELECT asset_group.id, asset_group.name, asset_group.status, campaign.name
      FROM asset_group
      WHERE campaign.name = '${escapedCampaign}'
        AND asset_group.name = '${escapedAg}'
        AND asset_group.status != 'REMOVED'
      LIMIT 5
    `.trim(),
    );
    if (!agSearch.ok) return { ok: false, error: agSearch.error, audit };
    const row = agSearch.results[0];
    const ag = row?.assetGroup as { id?: string; name?: string } | undefined;
    if (!ag?.id) {
      return {
        ok: false,
        error: `asset group not found: ${assetGroupName}`,
        available: audit.assetGroups.map((a) => a.name),
      };
    }
    target = {
      id: String(ag.id),
      name: String(ag.name ?? assetGroupName),
      filters: [],
      includedCount: 0,
      excludedCount: 0,
      subdivisionCount: 0,
    };
  }

  const byRn = new Map(target.filters.map((f) => [f.resourceName, f]));
  const sortedRemove = [...target.filters].sort(
    (a, b) => depthScore(b, byRn) - depthScore(a, byRn),
  );
  const removeOps = sortedRemove
    .filter((f) => f.resourceName)
    .map((f) => ({ remove: f.resourceName }));
  const createOpsPreview = buildSingleMetalListingCreateOps(
    customerId,
    target.id,
    metal,
    excludeBrand,
  );

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      campaignName,
      assetGroupId: target.id,
      assetGroupName: target.name,
      metal,
      excludeBrand,
      removeCount: removeOps.length,
      createCount: createOpsPreview.length,
      operationsPreview: [...removeOps, ...createOpsPreview],
      before: {
        includedCount: target.includedCount,
        excludedCount: target.excludedCount,
        filters: target.filters.length,
      },
    };
  }

  let removeMutate: unknown = null;
  if (removeOps.length) {
    removeMutate = await adsMutate(env, 'assetGroupListingGroupFilters:mutate', {
      operations: removeOps,
    });
    if (!(removeMutate as { ok?: boolean }).ok) {
      return {
        ok: false,
        phase: 'remove',
        assetGroupId: target.id,
        assetGroupName: target.name,
        metal,
        mutate: removeMutate,
      };
    }
  }

  const createRes = await createSingleMetalListingTree(
    env,
    customerId,
    target.id,
    metal,
    excludeBrand,
  );
  const after = await auditPmaxListingGroups(env, campaignName);
  return {
    ok: createRes.ok,
    dryRun: false,
    campaignName,
    assetGroupId: target.id,
    assetGroupName: target.name,
    metal,
    excludeBrand,
    removeMutate,
    mutate: createRes,
    after,
  };
}

export async function setAssetGroupStatus(
  env: AdsEnv,
  opts: {
    campaignName?: string;
    assetGroupName: string;
    status: 'ENABLED' | 'PAUSED';
    dryRun?: boolean;
  },
): Promise<Record<string, unknown>> {
  const campaignName = opts.campaignName ?? DEFAULT_PMAX_CAMPAIGN;
  const dryRun = opts.dryRun === true;
  const assetGroupName = opts.assetGroupName?.trim();
  if (!assetGroupName) return { ok: false, error: 'assetGroupName required' };
  if (opts.status !== 'ENABLED' && opts.status !== 'PAUSED') {
    return { ok: false, error: 'status must be ENABLED or PAUSED' };
  }

  const escapedCampaign = campaignName.replace(/'/g, "\\'");
  // List all non-removed AGs in campaign, then match name (GAQL name= can miss edge cases).
  const search = await adsSearch(
    env,
    `
    SELECT asset_group.id, asset_group.name, asset_group.status, asset_group.resource_name, campaign.name
    FROM asset_group
    WHERE campaign.name = '${escapedCampaign}'
    LIMIT 50
  `.trim(),
  );
  if (!search.ok) return { ok: false, error: search.error };

  const rows = search.results.map((row) => {
    const ag = row.assetGroup as {
      id?: string;
      name?: string;
      status?: string;
      resourceName?: string;
    };
    return {
      id: String(ag.id ?? ''),
      name: String(ag.name ?? ''),
      status: String(ag.status ?? ''),
      resourceName: ag.resourceName,
    };
  });

  let match = rows.find((r) => r.name.toLowerCase() === assetGroupName.toLowerCase());

  // Orphan / REMOVED AG may still appear only via listing filters (not in asset_group SELECT).
  if (!match) {
    const escapedAg = assetGroupName.replace(/'/g, "\\'");
    const listingLookup = await adsSearch(
      env,
      `
      SELECT asset_group.id, asset_group.name
      FROM asset_group_listing_group_filter
      WHERE campaign.name = '${escapedCampaign}'
        AND asset_group.name = '${escapedAg}'
      LIMIT 1
    `.trim(),
    );
    if (listingLookup.ok && listingLookup.results[0]) {
      const ag = listingLookup.results[0].assetGroup as { id?: string; name?: string };
      if (ag?.id) {
        match = {
          id: String(ag.id),
          name: String(ag.name ?? assetGroupName),
          status: 'REMOVED',
          resourceName: undefined,
        };
      }
    }
  }

  if (!match?.id) {
    return {
      ok: false,
      error: `asset group not found: ${assetGroupName}`,
      available: rows.map((r) => ({ id: r.id, name: r.name, status: r.status })),
    };
  }

  if (match.status === 'REMOVED') {
    return {
      ok: true,
      dryRun,
      campaignName,
      assetGroupId: match.id,
      assetGroupName: match.name,
      currentStatus: 'REMOVED',
      nextStatus: opts.status,
      note: 'Asset group already REMOVED — traktuj jako nieaktywną (pause zbędny).',
      available: rows.map((r) => ({ id: r.id, name: r.name, status: r.status })),
    };
  }

  const customerId = adsCustomerId(env);
  const resourceName =
    match.resourceName ?? `customers/${customerId}/assetGroups/${match.id}`;

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      campaignName,
      assetGroupId: match.id,
      assetGroupName: match.name,
      currentStatus: match.status || null,
      nextStatus: opts.status,
      available: rows.map((r) => ({ id: r.id, name: r.name, status: r.status })),
    };
  }

  const mutated = await adsMutate(env, 'assetGroups:mutate', {
    operations: [
      {
        update: {
          resourceName,
          status: opts.status,
        },
        updateMask: 'status',
      },
    ],
  });
  return {
    ok: mutated.ok,
    dryRun: false,
    campaignName,
    assetGroupId: match.id,
    assetGroupName: match.name,
    previousStatus: match.status || null,
    nextStatus: opts.status,
    mutate: mutated,
  };
}

export async function renamePmaxAssetGroup(
  env: AdsEnv,
  opts: {
    campaignName?: string;
    assetGroupName: string;
    newName: string;
    dryRun?: boolean;
  },
): Promise<Record<string, unknown>> {
  const campaignName = opts.campaignName ?? DEFAULT_PMAX_CAMPAIGN;
  const dryRun = opts.dryRun === true;
  const assetGroupName = opts.assetGroupName?.trim();
  const newName = opts.newName?.trim();
  if (!assetGroupName || !newName) {
    return { ok: false, error: 'assetGroupName and newName required' };
  }

  const escapedCampaign = campaignName.replace(/'/g, "\\'");
  const search = await adsSearch(
    env,
    `
    SELECT asset_group.id, asset_group.name, asset_group.resource_name, campaign.name
    FROM asset_group
    WHERE campaign.name = '${escapedCampaign}'
      AND asset_group.status != 'REMOVED'
    LIMIT 50
  `.trim(),
  );
  if (!search.ok) return { ok: false, error: search.error };

  const match = search.results
    .map((row) => {
      const ag = row.assetGroup as { id?: string; name?: string; resourceName?: string };
      return {
        id: String(ag.id ?? ''),
        name: String(ag.name ?? ''),
        resourceName: ag.resourceName,
      };
    })
    .find((r) => r.name.toLowerCase() === assetGroupName.toLowerCase());

  if (!match?.id) {
    return { ok: false, error: `asset group not found: ${assetGroupName}` };
  }

  const customerId = adsCustomerId(env);
  const resourceName =
    match.resourceName ?? `customers/${customerId}/assetGroups/${match.id}`;

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      campaignName,
      assetGroupId: match.id,
      previousName: match.name,
      nextName: newName,
    };
  }

  const mutated = await adsMutate(env, 'assetGroups:mutate', {
    operations: [
      {
        update: {
          resourceName,
          name: newName,
        },
        updateMask: 'name',
      },
    ],
  });
  return {
    ok: mutated.ok,
    dryRun: false,
    campaignName,
    assetGroupId: match.id,
    previousName: match.name,
    nextName: newName,
    mutate: mutated,
  };
}

/**
 * Clone PMax asset group creatives from source → new AG (same campaign).
 * Links existing Asset resources; does not duplicate binary assets.
 */
export async function clonePmaxAssetGroup(
  env: AdsEnv,
  opts: {
    campaignName?: string;
    sourceAssetGroupName: string;
    newAssetGroupName: string;
    dryRun?: boolean;
  },
): Promise<Record<string, unknown>> {
  const campaignName = opts.campaignName ?? DEFAULT_PMAX_CAMPAIGN;
  const dryRun = opts.dryRun === true;
  const sourceName = opts.sourceAssetGroupName?.trim();
  const newName = opts.newAssetGroupName?.trim();
  if (!sourceName || !newName) {
    return { ok: false, error: 'sourceAssetGroupName and newAssetGroupName required' };
  }

  const escapedCampaign = campaignName.replace(/'/g, "\\'");
  const escapedSource = sourceName.replace(/'/g, "\\'");

  const existing = await adsSearch(
    env,
    `
    SELECT asset_group.id, asset_group.name
    FROM asset_group
    WHERE campaign.name = '${escapedCampaign}'
      AND asset_group.name = '${newName.replace(/'/g, "\\'")}'
      AND asset_group.status != 'REMOVED'
    LIMIT 1
  `.trim(),
  );
  if (existing.ok && existing.results.length) {
    const ag = existing.results[0].assetGroup as { id?: string; name?: string };
    return {
      ok: true,
      alreadyExists: true,
      assetGroupId: String(ag.id ?? ''),
      assetGroupName: String(ag.name ?? newName),
    };
  }

  const sourceSearch = await adsSearch(
    env,
    `
    SELECT
      asset_group.id,
      asset_group.name,
      asset_group.resource_name,
      asset_group.final_urls,
      asset_group.final_mobile_urls,
      asset_group.status,
      campaign.resource_name,
      campaign.id
    FROM asset_group
    WHERE campaign.name = '${escapedCampaign}'
      AND asset_group.name = '${escapedSource}'
      AND asset_group.status != 'REMOVED'
    LIMIT 1
  `.trim(),
  );
  if (!sourceSearch.ok) return { ok: false, error: sourceSearch.error };
  if (!sourceSearch.results.length) {
    return { ok: false, error: `source asset group not found: ${sourceName}` };
  }

  const sourceRow = sourceSearch.results[0];
  const sourceAg = sourceRow.assetGroup as {
    id?: string;
    name?: string;
    resourceName?: string;
    finalUrls?: string[];
    finalMobileUrls?: string[];
    status?: string;
  };
  const campaign = sourceRow.campaign as { resourceName?: string; id?: string };

  const assetsSearch = await adsSearch(
    env,
    `
    SELECT
      asset_group_asset.field_type,
      asset_group_asset.asset,
      asset_group_asset.status
    FROM asset_group_asset
    WHERE asset_group.name = '${escapedSource}'
      AND asset_group_asset.status != 'REMOVED'
    LIMIT 200
  `.trim(),
  );
  if (!assetsSearch.ok) return { ok: false, error: assetsSearch.error };

  const SKIP_FIELD_TYPES = new Set([
    'UBERVERSAL',
    'AD_IMAGE',
    'UNKNOWN',
    'UNSPECIFIED',
  ]);

  const links = assetsSearch.results
    .map((row) => {
      const aga = row.assetGroupAsset as {
        fieldType?: string;
        asset?: string;
        status?: string;
      };
      return {
        fieldType: String(aga.fieldType ?? ''),
        asset: String(aga.asset ?? ''),
      };
    })
    .filter((l) => l.fieldType && l.asset && !SKIP_FIELD_TYPES.has(l.fieldType));

  const customerId = adsCustomerId(env);
  const campaignRn =
    campaign.resourceName ?? `customers/${customerId}/campaigns/${campaign.id}`;
  const newAgTempRn = `customers/${customerId}/assetGroups/-1`;
  const finalUrls = (sourceAg.finalUrls ?? []).filter(
    (u) => !/l\.epirbizuteria\.pl/i.test(u),
  );
  const finalMobileUrls = (sourceAg.finalMobileUrls ?? []).filter(
    (u) => !/l\.epirbizuteria\.pl/i.test(u),
  );
  const agCreate: Record<string, unknown> = {
    resourceName: newAgTempRn,
    name: newName,
    campaign: campaignRn,
    status: 'ENABLED',
  };
  if (finalUrls.length) {
    agCreate.finalUrls = finalUrls;
    agCreate.finalMobileUrls = finalMobileUrls.length ? finalMobileUrls : finalUrls;
  }

  const mutateOperations: unknown[] = [
    {
      assetGroupOperation: {
        create: agCreate,
      },
    },
    ...links.map((link) => ({
      assetGroupAssetOperation: {
        create: {
          assetGroup: newAgTempRn,
          asset: link.asset,
          fieldType: link.fieldType,
        },
      },
    })),
  ];

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      campaignName,
      sourceAssetGroupId: sourceAg.id,
      sourceAssetGroupName: sourceAg.name,
      newAssetGroupName: newName,
      linkedAssets: links.length,
      mutateOperationsCount: mutateOperations.length,
    };
  }

  const res = await adsMutate(env, 'googleAds:mutate', { mutateOperations });
  if (!res.ok) return { ok: false, error: res.error, linkedAssets: links.length };

  const responses = (
    res.data as {
      mutateOperationResponses?: Array<{
        assetGroupResult?: { resourceName?: string };
      }>;
    }
  )?.mutateOperationResponses;
  const createdRn = responses?.find((r) => r.assetGroupResult?.resourceName)?.assetGroupResult
    ?.resourceName;
  const newId = createdRn?.split('/').pop();

  return {
    ok: true,
    dryRun: false,
    campaignName,
    sourceAssetGroupId: sourceAg.id,
    sourceAssetGroupName: sourceAg.name,
    newAssetGroupName: newName,
    newAssetGroupId: newId ?? null,
    newAssetGroupResourceName: createdRn ?? null,
    linkedAssets: links.length,
    mutate: res.data,
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
      n.includes('złot') ||
      n.includes('zlot') ||
      n.includes('gold') ||
      n.includes('epir_zloto') ||
      n.includes('epir zloto')
    ) {
      key = 'artisan_gold';
    } else if (
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

const LANDING_HOST_PATTERN = /l\.epirbizuteria\.pl/i;

/**
 * Stop PMax traffic to campaign landings: clear final_url_suffix and asset-group final_urls
 * pointing at l.epirbizuteria.pl so Shopping uses GMC product URLs only.
 */
export async function disablePmaxLandings(
  env: AdsEnv,
  opts?: { campaignName?: string; dryRun?: boolean },
): Promise<Record<string, unknown>> {
  const campaignName = opts?.campaignName ?? DEFAULT_PMAX_CAMPAIGN;
  const dryRun = opts?.dryRun === true;
  const escaped = campaignName.replace(/'/g, "\\'");

  const agSearch = await adsSearch(
    env,
    `
    SELECT
      asset_group.id,
      asset_group.name,
      asset_group.resource_name,
      asset_group.final_urls
    FROM asset_group
    WHERE campaign.name = '${escaped}'
      AND asset_group.status != 'REMOVED'
  `.trim(),
  );
  if (!agSearch.ok) return { ok: false, error: agSearch.error };

  const assetGroups = agSearch.results.map((row) => {
    const ag = row.assetGroup as {
      id?: string;
      name?: string;
      resourceName?: string;
      finalUrls?: string[];
    };
    return {
      id: String(ag.id ?? ''),
      name: String(ag.name ?? ''),
      resourceName: String(ag.resourceName ?? ''),
      finalUrls: ag.finalUrls ?? [],
    };
  });

  const toClear = assetGroups.filter(
    (ag) => ag.finalUrls.length > 0 && ag.finalUrls.some((u) => LANDING_HOST_PATTERN.test(u)),
  );

  const suffixResult = await setCampaignFinalUrlSuffix(env, {
    campaignName,
    finalUrlSuffix: '',
    dryRun,
  });

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      campaignName,
      campaignSuffix: suffixResult,
      assetGroupsToClear: toClear,
    };
  }

  const mutateResults: unknown[] = [];
  for (const ag of toClear) {
    const mutated = await adsMutate(env, 'assetGroups:mutate', {
      operations: [
        {
          update: {
            resourceName: ag.resourceName,
            finalUrls: [],
          },
          updateMask: 'finalUrls',
        },
      ],
    });
    mutateResults.push({ assetGroupId: ag.id, assetGroupName: ag.name, mutate: mutated });
  }

  return {
    ok: true,
    dryRun: false,
    campaignName,
    campaignSuffix: suffixResult,
    clearedAssetGroups: toClear.map((a) => ({ id: a.id, name: a.name })),
    mutateResults,
  };
}
