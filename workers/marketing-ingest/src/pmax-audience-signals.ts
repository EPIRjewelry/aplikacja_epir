/**
 * PMax audience signals — jedna składana Audience (wiele user lists) per asset group.
 */
import type { AdsEnv } from './ads';
import { adsMutate, adsSearch } from './ads-api';
import {
  DEFAULT_PMAX_CAMPAIGN_FOR_AUDIENCES,
  resolveAudienceListNames,
  resolveCombinedAudienceName,
} from './pmax-audience-signals-config';

function escapeGaqlLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

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

export type AudienceSignalRow = {
  resourceName: string;
  assetGroupId: string;
  assetGroupName: string;
  audienceResourceName: string;
};

async function resolveAssetGroup(
  env: AdsEnv,
  campaignName: string,
  assetGroupName: string,
): Promise<{ ok: true; id: string; resourceName: string } | { ok: false; error: string }> {
  const search = await adsSearch(
    env,
    `
    SELECT asset_group.id, asset_group.resource_name
    FROM asset_group
    WHERE campaign.name = '${escapeGaqlLiteral(campaignName)}'
      AND asset_group.name = '${escapeGaqlLiteral(assetGroupName)}'
      AND asset_group.status != 'REMOVED'
    LIMIT 1
  `.trim(),
  );
  if (!search.ok) return { ok: false, error: search.error };
  const row = search.results[0] as { assetGroup?: { id?: string; resourceName?: string } };
  const id = str(row?.assetGroup?.id);
  const resourceName = str(row?.assetGroup?.resourceName);
  if (!id || !resourceName) {
    return { ok: false, error: `asset group not found: ${assetGroupName}` };
  }
  return { ok: true, id, resourceName };
}

async function findUserList(
  env: AdsEnv,
  listName: string,
): Promise<{ ok: true; resourceName: string } | { ok: false; error: string }> {
  const search = await adsSearch(
    env,
    `
    SELECT user_list.resource_name, user_list.name
    FROM user_list
    WHERE user_list.name = '${escapeGaqlLiteral(listName)}'
    LIMIT 1
  `.trim(),
  );
  if (!search.ok) return { ok: false, error: search.error };
  const row = search.results[0] as { userList?: { resourceName?: string } };
  const resourceName = str(row?.userList?.resourceName);
  if (!resourceName) return { ok: false, error: `user list not found: ${listName}` };
  return { ok: true, resourceName };
}

async function fetchAudienceSignalRows(
  env: AdsEnv,
  campaignName: string,
  assetGroupName: string,
): Promise<{ ok: true; rows: AudienceSignalRow[] } | { ok: false; error: string }> {
  const search = await adsSearch(
    env,
    `
    SELECT
      asset_group_signal.resource_name,
      asset_group_signal.audience.audience,
      asset_group.id,
      asset_group.name
    FROM asset_group_signal
    WHERE campaign.name = '${escapeGaqlLiteral(campaignName)}'
      AND asset_group.name = '${escapeGaqlLiteral(assetGroupName)}'
      AND asset_group.status != 'REMOVED'
      AND asset_group_signal.audience.audience IS NOT NULL
    LIMIT 20
  `.trim(),
  );
  if (!search.ok) return search;
  const rows: AudienceSignalRow[] = [];
  for (const r of search.results) {
    const audienceResourceName = str(pick(r, ['assetGroupSignal', 'audience', 'audience']));
    if (!audienceResourceName) continue;
    rows.push({
      resourceName: str(pick(r, ['assetGroupSignal', 'resourceName'])),
      assetGroupId: str(pick(r, ['assetGroup', 'id'])),
      assetGroupName: str(pick(r, ['assetGroup', 'name'])),
      audienceResourceName,
    });
  }
  return { ok: true, rows };
}

async function findAudienceByNameOnAssetGroup(
  env: AdsEnv,
  assetGroupResourceName: string,
  audienceName: string,
): Promise<string | null> {
  const search = await adsSearch(
    env,
    `
    SELECT audience.resource_name, audience.name
    FROM audience
    WHERE audience.asset_group = '${escapeGaqlLiteral(assetGroupResourceName)}'
      AND audience.name = '${escapeGaqlLiteral(audienceName)}'
    LIMIT 1
  `.trim(),
  );
  if (!search.ok) return null;
  return str(pick(search.results[0], ['audience', 'resourceName'])) || null;
}

async function createCombinedAudience(
  env: AdsEnv,
  assetGroupResourceName: string,
  audienceName: string,
  userListResourceNames: string[],
  dryRun: boolean,
): Promise<{ ok: true; audienceResourceName: string } | { ok: false; error: string }> {
  if (dryRun) {
    return { ok: true, audienceResourceName: `(dry-run) ${audienceName}` };
  }
  const res = await adsMutate(env, 'audiences:mutate', {
    operations: [
      {
        create: {
          name: audienceName,
          description: `EPIR combined CRM audience (${userListResourceNames.length} lists)`,
          scope: 'ASSET_GROUP',
          assetGroup: assetGroupResourceName,
          dimensions: [
            {
              audienceSegments: {
                segments: userListResourceNames.map((userList) => ({
                  userList: { userList },
                })),
              },
            },
          ],
        },
      },
    ],
  });
  if (!res.ok) return res;
  const rn = str((res.data as { results?: Array<{ resourceName?: string }> }).results?.[0]?.resourceName);
  if (!rn) return { ok: false, error: 'audiences:mutate missing resourceName' };
  return { ok: true, audienceResourceName: rn };
}

export async function auditPmaxAudienceSignals(
  env: AdsEnv,
  opts?: { campaignName?: string; assetGroupName?: string },
) {
  const campaignName = opts?.campaignName?.trim() || DEFAULT_PMAX_CAMPAIGN_FOR_AUDIENCES;
  const assetGroupName = opts?.assetGroupName?.trim();
  if (!assetGroupName) {
    return { ok: false, error: 'assetGroupName required (EPIR_Srebro | EPIR_Zloto)' };
  }
  const lists = resolveAudienceListNames(assetGroupName);
  if ('error' in lists) return { ok: false, error: lists.error };

  const fetched = await fetchAudienceSignalRows(env, campaignName, assetGroupName);
  if (!fetched.ok) return { ok: false, error: fetched.error };

  return {
    ok: true,
    campaignName,
    assetGroupName,
    combinedAudienceName: resolveCombinedAudienceName(assetGroupName),
    configuredLists: lists,
    signals: fetched.rows,
    signalCount: fetched.rows.length,
    note: 'PMax allows one audience signal per asset group; lists are combined into one Audience.',
  };
}

export async function applyPmaxAudienceSignals(
  env: AdsEnv,
  opts?: { campaignName?: string; assetGroupName?: string; dryRun?: boolean },
) {
  const campaignName = opts?.campaignName?.trim() || DEFAULT_PMAX_CAMPAIGN_FOR_AUDIENCES;
  const assetGroupName = opts?.assetGroupName?.trim();
  const dryRun = opts?.dryRun !== false;
  if (!assetGroupName) {
    return { ok: false, error: 'assetGroupName required (EPIR_Srebro | EPIR_Zloto)' };
  }

  const lists = resolveAudienceListNames(assetGroupName);
  if ('error' in lists) return { ok: false, error: lists.error };

  const ag = await resolveAssetGroup(env, campaignName, assetGroupName);
  if (!ag.ok) return { ok: false, error: ag.error };

  const userLists: Array<{ listName: string; resourceName: string }> = [];
  for (const listName of lists) {
    const ul = await findUserList(env, listName);
    if (!ul.ok) return { ok: false, error: ul.error };
    userLists.push({ listName, resourceName: ul.resourceName });
  }

  const audienceName = resolveCombinedAudienceName(assetGroupName);
  let audienceRn = await findAudienceByNameOnAssetGroup(env, ag.resourceName, audienceName);
  if (!audienceRn) {
    const created = await createCombinedAudience(
      env,
      ag.resourceName,
      audienceName,
      userLists.map((u) => u.resourceName),
      dryRun,
    );
    if (!created.ok) return { ok: false, error: created.error };
    audienceRn = created.audienceResourceName;
  }

  const existing = await fetchAudienceSignalRows(env, campaignName, assetGroupName);
  if (!existing.ok) return { ok: false, error: existing.error };

  const already = existing.rows.some((r) => r.audienceResourceName === audienceRn);
  const mutateResults: unknown[] = [];

  if (!dryRun) {
    for (const row of existing.rows) {
      if (row.audienceResourceName === audienceRn) continue;
      const removed = await adsMutate(env, 'assetGroupSignals:mutate', {
        operations: [{ remove: row.resourceName }],
      });
      mutateResults.push({ action: 'remove', signal: row.resourceName, mutate: removed });
      if (!removed.ok) {
        return {
          ok: false,
          error: removed.error,
          audienceName,
          audienceResourceName: audienceRn,
          userLists,
          existingSignals: existing.rows,
          mutateResults,
        };
      }
    }
  }

  const needsCreate =
    !dryRun &&
    !audienceRn.startsWith('(dry-run)') &&
    (existing.rows.length === 0 ||
      !existing.rows.some((r) => r.audienceResourceName === audienceRn));

  if (needsCreate) {
    const mutated = await adsMutate(env, 'assetGroupSignals:mutate', {
      operations: [
        {
          create: {
            assetGroup: ag.resourceName,
            audience: { audience: audienceRn },
          },
        },
      ],
    });
    mutateResults.push({ action: 'create', audienceName, mutate: mutated });
    if (!mutated.ok) {
      return {
        ok: false,
        error: mutated.error,
        audienceName,
        audienceResourceName: audienceRn,
        userLists,
        existingSignals: existing.rows,
        mutateResults,
      };
    }
  }

  const after = dryRun
    ? null
    : await auditPmaxAudienceSignals(env, { campaignName, assetGroupName });

  return {
    ok: true,
    dryRun,
    campaignName,
    assetGroupName,
    combinedAudienceName: audienceName,
    audienceResourceName: audienceRn,
    userLists,
    existingSignals: existing.rows,
    signalCreated: needsCreate,
    signalAlreadyPresent: already && existing.rows.some((r) => r.audienceResourceName === audienceRn),
    mutateResults,
    after,
  };
}
