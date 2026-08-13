/**
 * PMax Search Themes — audyt + apply (kontrakt EPIR, HITL dry-run).
 * Scope per asset group: EPIR_Srebro / EPIR_Zloto (alias: Grupa plików 1).
 */
import type { AdsEnv } from './ads';
import { adsCustomerId, adsMutate, adsSearch } from './ads-api';
import {
  classifyThemeText,
  planSearchThemeChanges,
  type ThemeChangePlan,
  type ThemeRow,
} from './ads-classify';
import {
  DEFAULT_PMAX_SEARCH_THEMES_CONTRACT,
  resolveSearchThemesContract,
  type SearchThemesContract,
} from './pmax-search-themes-config';

export const DEFAULT_PMAX_CAMPAIGN_FOR_THEMES =
  DEFAULT_PMAX_SEARCH_THEMES_CONTRACT.campaignName;

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

function escapeGaqlLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export type SearchThemesAudit = {
  campaignName: string;
  customerId: string;
  assetGroupName: string | null;
  contract: Pick<
    SearchThemesContract,
    'allowlistThemes' | 'blocklistPatterns' | 'pruneNonAllowlist'
  >;
  assetGroups: Array<{
    id: string;
    name: string;
    themes: Array<{
      resourceName: string;
      text: string;
      classification: string;
      approvalStatus: string;
      disapprovalReasons: string[];
    }>;
    counts: { total: number; blocklisted: number; allowlisted: number; neutral: number };
  }>;
  totals: { themes: number; blocklisted: number; allowlisted: number; neutral: number };
  interpretation: string;
};

async function fetchSearchThemeRows(
  env: AdsEnv,
  campaignName: string,
  assetGroupName?: string,
): Promise<{ ok: true; rows: ThemeRow[] } | { ok: false; error: string }> {
  const escaped = escapeGaqlLiteral(campaignName);
  const agFilter = assetGroupName?.trim()
    ? `AND asset_group.name = '${escapeGaqlLiteral(assetGroupName.trim())}'`
    : '';
  const query = `
    SELECT
      asset_group_signal.resource_name,
      asset_group_signal.approval_status,
      asset_group_signal.disapproval_reasons,
      asset_group_signal.search_theme.text,
      asset_group.id,
      asset_group.name,
      campaign.name
    FROM asset_group_signal
    WHERE campaign.name = '${escaped}'
      AND campaign.status != 'REMOVED'
      AND asset_group.status != 'REMOVED'
      AND asset_group_signal.search_theme.text IS NOT NULL
      ${agFilter}
    LIMIT 500
  `.trim();

  const search = await adsSearch(env, query);
  if (!search.ok) return search;

  const rows: ThemeRow[] = [];
  for (const r of search.results) {
    const text = str(pick(r, ['assetGroupSignal', 'searchTheme', 'text']));
    if (!text) continue;
    rows.push({
      resourceName: str(pick(r, ['assetGroupSignal', 'resourceName'])),
      assetGroupId: str(pick(r, ['assetGroup', 'id'])),
      assetGroupName: str(pick(r, ['assetGroup', 'name'])),
      text,
      approvalStatus: str(pick(r, ['assetGroupSignal', 'approvalStatus'])),
    });
  }
  return { ok: true, rows };
}

async function resolveAssetGroupId(
  env: AdsEnv,
  campaignName: string,
  assetGroupName: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const search = await adsSearch(
    env,
    `
    SELECT asset_group.id, asset_group.name
    FROM asset_group
    WHERE campaign.name = '${escapeGaqlLiteral(campaignName)}'
      AND asset_group.name = '${escapeGaqlLiteral(assetGroupName)}'
      AND asset_group.status != 'REMOVED'
    LIMIT 5
  `.trim(),
  );
  if (!search.ok) return { ok: false, error: search.error };
  const ag = search.results[0]?.assetGroup as { id?: string; name?: string } | undefined;
  if (!ag?.id) return { ok: false, error: `asset group not found: ${assetGroupName}` };
  return { ok: true, id: String(ag.id), name: String(ag.name ?? assetGroupName) };
}

function emptyAssetGroupPlan(
  assetGroupId: string,
  assetGroupName: string,
  contract: SearchThemesContract,
): ThemeChangePlan {
  return {
    assetGroupId,
    assetGroupName,
    remove: [],
    add: contract.allowlistThemes.slice(0, contract.maxThemesPerAssetGroup),
    keep: [],
    skippedAdd: contract.allowlistThemes.slice(contract.maxThemesPerAssetGroup),
  };
}

export async function auditPmaxSearchThemes(
  env: AdsEnv,
  opts?: {
    campaignName?: string;
    assetGroupName?: string;
    contract?: SearchThemesContract;
  },
): Promise<SearchThemesAudit | { error: string }> {
  const assetGroupName = opts?.assetGroupName?.trim() || null;
  let contract = opts?.contract;
  if (!contract && assetGroupName) {
    const resolved = resolveSearchThemesContract(assetGroupName);
    if ('error' in resolved) return resolved;
    contract = resolved;
  }
  contract = contract ?? DEFAULT_PMAX_SEARCH_THEMES_CONTRACT;
  const name = opts?.campaignName?.trim() || contract.campaignName;

  const fetched = await fetchSearchThemeRows(env, name, assetGroupName ?? undefined);
  if (!fetched.ok) return { error: fetched.error };

  const byAg = new Map<
    string,
    {
      id: string;
      name: string;
      themes: SearchThemesAudit['assetGroups'][0]['themes'];
      counts: { total: number; blocklisted: number; allowlisted: number; neutral: number };
    }
  >();

  let blocklisted = 0;
  let allowlisted = 0;
  let neutral = 0;

  for (const row of fetched.rows) {
    const cls = classifyThemeText(
      row.text,
      contract.allowlistThemes,
      contract.blocklistPatterns,
    );
    if (cls === 'blocklisted') blocklisted += 1;
    else if (cls === 'allowlisted') allowlisted += 1;
    else neutral += 1;

    let ag = byAg.get(row.assetGroupId);
    if (!ag) {
      ag = {
        id: row.assetGroupId,
        name: row.assetGroupName,
        themes: [],
        counts: { total: 0, blocklisted: 0, allowlisted: 0, neutral: 0 },
      };
      byAg.set(row.assetGroupId, ag);
    }
    ag.themes.push({
      resourceName: row.resourceName,
      text: row.text,
      classification: cls,
      approvalStatus: row.approvalStatus ?? '',
      disapprovalReasons: [],
    });
    ag.counts.total += 1;
    ag.counts[cls] += 1;
  }

  const interpretation =
    blocklisted > 0
      ? `${blocklisted} tematów pasuje do blocklisty — rozważ apply (dry-run najpierw).`
      : contract.pruneNonAllowlist
        ? `Brak blocklisty; pruneNonAllowlist=true — apply usunie tematy spoza allowlisty (${contract.allowlistThemes.length}).`
        : 'Brak tematów z blocklisty; allowlist można uzupełnić przez apply.';

  return {
    campaignName: name,
    customerId: adsCustomerId(env),
    assetGroupName,
    contract: {
      allowlistThemes: contract.allowlistThemes,
      blocklistPatterns: contract.blocklistPatterns,
      pruneNonAllowlist: contract.pruneNonAllowlist,
    },
    assetGroups: [...byAg.values()],
    totals: {
      themes: fetched.rows.length,
      blocklisted,
      allowlisted,
      neutral,
    },
    interpretation,
  };
}

export async function applyPmaxSearchThemes(
  env: AdsEnv,
  opts?: {
    campaignName?: string;
    assetGroupName?: string;
    dryRun?: boolean;
    contract?: SearchThemesContract;
  },
): Promise<Record<string, unknown>> {
  const assetGroupName = opts?.assetGroupName?.trim();
  if (!assetGroupName) {
    return {
      ok: false,
      error:
        'assetGroupName required for apply (EPIR_Srebro | EPIR_Zloto | Grupa plików 1)',
    };
  }

  let contract = opts?.contract;
  if (!contract) {
    const resolved = resolveSearchThemesContract(assetGroupName);
    if ('error' in resolved) return { ok: false, ...resolved };
    contract = resolved;
  }

  const campaignName = opts?.campaignName?.trim() || contract.campaignName;
  const dryRun = opts?.dryRun !== false;

  const fetched = await fetchSearchThemeRows(env, campaignName, assetGroupName);
  if (!fetched.ok) return { ok: false, error: fetched.error };

  let plans = planSearchThemeChanges(
    fetched.rows,
    contract.allowlistThemes,
    contract.blocklistPatterns,
    contract.maxThemesPerAssetGroup,
    { pruneNonAllowlist: contract.pruneNonAllowlist },
  );

  if (plans.length === 0) {
    const ag = await resolveAssetGroupId(env, campaignName, assetGroupName);
    if (!ag.ok) return { ok: false, error: ag.error };
    plans = [emptyAssetGroupPlan(ag.id, ag.name, contract)];
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      campaignName,
      assetGroupName,
      plans,
      summary: {
        remove: plans.reduce((n, p) => n + p.remove.length, 0),
        add: plans.reduce((n, p) => n + p.add.length, 0),
        skippedAdd: plans.reduce((n, p) => n + p.skippedAdd.length, 0),
      },
    };
  }

  const customerId = adsCustomerId(env);
  const mutateResults: unknown[] = [];

  for (const plan of plans) {
    for (const row of plan.remove) {
      if (!row.resourceName) continue;
      const mutated = await adsMutate(env, 'assetGroupSignals:mutate', {
        operations: [{ remove: row.resourceName }],
      });
      mutateResults.push({ action: 'remove', theme: row.text, mutate: mutated });
      if (!mutated.ok) {
        return {
          ok: false,
          error: mutated.error,
          partialResults: mutateResults,
          plan,
        };
      }
    }

    const assetGroupRn = `customers/${customerId}/assetGroups/${plan.assetGroupId}`;
    for (const text of plan.add) {
      const mutated = await adsMutate(env, 'assetGroupSignals:mutate', {
        operations: [
          {
            create: {
              assetGroup: assetGroupRn,
              searchTheme: { text },
            },
          },
        ],
      });
      mutateResults.push({ action: 'create', theme: text, mutate: mutated });
      if (!mutated.ok) {
        return {
          ok: false,
          error: mutated.error,
          partialResults: mutateResults,
          plan,
        };
      }
    }
  }

  const after = await auditPmaxSearchThemes(env, {
    campaignName,
    assetGroupName,
    contract,
  });
  return {
    ok: true,
    dryRun: false,
    campaignName,
    assetGroupName,
    plans,
    mutateResults,
    after,
  };
}
