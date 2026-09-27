/**
 * Opt out of PMax Final URL expansion on one campaign.
 * Preserves every other asset_automation_settings row.
 */
import type { AdsEnv } from './ads';
import { adsCustomerId, adsMutate, adsSearch } from './ads-api';

export const PMAX_URL_EXPANSION_CAMPAIGN = 'Epir_Forest-Dark';
export const URL_EXPANSION_AUTOMATION_TYPE = 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION';

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

export interface AssetAutomationSetting {
  assetAutomationType: string;
  assetAutomationStatus: string;
}

export function planUrlExpansionOptOut(current: AssetAutomationSetting[]): {
  next: AssetAutomationSetting[];
  alreadyOptedOut: boolean;
} {
  const next = current.map((row) => ({ ...row }));
  const hit = next.find((row) => row.assetAutomationType === URL_EXPANSION_AUTOMATION_TYPE);
  if (hit) {
    const alreadyOptedOut = hit.assetAutomationStatus === 'OPTED_OUT';
    hit.assetAutomationStatus = 'OPTED_OUT';
    return { next, alreadyOptedOut };
  }
  next.push({
    assetAutomationType: URL_EXPANSION_AUTOMATION_TYPE,
    assetAutomationStatus: 'OPTED_OUT',
  });
  return { next, alreadyOptedOut: false };
}

export async function setPmaxUrlExpansionOptOut(
  env: AdsEnv,
  opts?: { campaign?: string; dryRun?: boolean },
): Promise<Record<string, unknown>> {
  const campaign = (opts?.campaign ?? PMAX_URL_EXPANSION_CAMPAIGN).trim();
  const dryRun = opts?.dryRun !== false;
  if (campaign !== PMAX_URL_EXPANSION_CAMPAIGN) {
    return {
      ok: false,
      error: `refusing campaign ${campaign}; only ${PMAX_URL_EXPANSION_CAMPAIGN} is allowed`,
    };
  }

  const escaped = campaign.replace(/'/g, "\\'");
  const search = await adsSearch(
    env,
    `
    SELECT
      campaign.id,
      campaign.name,
      campaign.resource_name,
      campaign.asset_automation_settings
    FROM campaign
    WHERE campaign.name = '${escaped}'
      AND campaign.status != 'REMOVED'
    LIMIT 5
  `.trim(),
  );
  if (!search.ok) return { ok: false, stage: 'ads', error: search.error };
  if (!search.results.length) return { ok: false, error: `campaign not found: ${campaign}` };

  const row = search.results[0];
  const resourceName = str(pick(row, ['campaign', 'resourceName']));
  const campaignId = str(pick(row, ['campaign', 'id']));
  const rawSettings = pick(row, ['campaign', 'assetAutomationSettings']);
  const current: AssetAutomationSetting[] = Array.isArray(rawSettings)
    ? rawSettings.map((item) => {
        const rec = item as Record<string, unknown>;
        return {
          assetAutomationType: str(rec.assetAutomationType),
          assetAutomationStatus: str(rec.assetAutomationStatus),
        };
      })
    : [];

  const planned = planUrlExpansionOptOut(current);
  const snapshot = {
    ok: true,
    readOnly: dryRun,
    campaign,
    campaignId,
    resourceName,
    current,
    next: planned.next,
    alreadyOptedOut: planned.alreadyOptedOut,
    expansionType: URL_EXPANSION_AUTOMATION_TYPE,
  };

  if (dryRun || planned.alreadyOptedOut) return { ...snapshot, dryRun, mutated: false };

  const customerId = adsCustomerId(env);
  const mutated = await adsMutate(env, 'campaigns:mutate', {
    operations: [
      {
        update: {
          resourceName: resourceName || `customers/${customerId}/campaigns/${campaignId}`,
          assetAutomationSettings: planned.next,
        },
        updateMask: 'assetAutomationSettings',
      },
    ],
  });

  return {
    ...snapshot,
    dryRun: false,
    mutated: mutated.ok,
    mutate: mutated.ok ? mutated.data : { error: mutated.error },
    ok: mutated.ok,
  };
}
