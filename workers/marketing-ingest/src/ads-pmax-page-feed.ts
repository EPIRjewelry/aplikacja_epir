/**
 * PMax page feed (PAGE_FEED AssetSet + CampaignAssetSet) for expansion OFF control.
 * URLs: freeze-approved four only. Campaign: Epir_Forest-Dark.
 */
import type { AdsEnv } from './ads';
import {
  FREEZE_COLLECTION_GALAZKI,
  FREEZE_GOLD_COLLECTION,
  FREEZE_PDP_TURMALIN,
  FREEZE_SILVER_COLLECTION,
} from './ads-freeze-apply';
import { adsCustomerId, adsMutate, adsSearch } from './ads-api';
import type { AssetAutomationSetting } from './ads-pmax-url-expansion';
import { URL_EXPANSION_AUTOMATION_TYPE } from './ads-pmax-url-expansion';

export const PMAX_PAGE_FEED_CAMPAIGN = 'Epir_Forest-Dark';
export const TEXT_ASSET_AUTOMATION_TYPE = 'TEXT_ASSET_AUTOMATION';
export const PAGE_FEED_LABEL = 'epir_freeze_pmax';
export const PAGE_FEED_ASSET_SET_NAME = 'EPIR PMax freeze page feed';

export const FREEZE_PAGE_FEED_URLS = [
  FREEZE_GOLD_COLLECTION,
  FREEZE_SILVER_COLLECTION,
  FREEZE_PDP_TURMALIN,
  FREEZE_COLLECTION_GALAZKI,
] as const;

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

export function normalizePageFeedUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/$/, '');
}

export function planMissingPageFeedUrls(
  have: readonly string[],
  want: readonly string[] = FREEZE_PAGE_FEED_URLS,
): string[] {
  const set = new Set(have.map(normalizePageFeedUrl));
  return want.filter((u) => !set.has(normalizePageFeedUrl(u)));
}

export function urlsMatchFreezeSet(have: readonly string[]): boolean {
  return planMissingPageFeedUrls(have).length === 0;
}

function parseAutomationSettings(raw: unknown): AssetAutomationSetting[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const rec = item as Record<string, unknown>;
    return {
      assetAutomationType: str(rec.assetAutomationType),
      assetAutomationStatus: str(rec.assetAutomationStatus),
    };
  });
}

export function planTextAutomationOptIn(current: AssetAutomationSetting[]): {
  next: AssetAutomationSetting[];
  needsUpdate: boolean;
} {
  const next = current.map((row) => ({ ...row }));
  const hit = next.find((row) => row.assetAutomationType === TEXT_ASSET_AUTOMATION_TYPE);
  if (hit) {
    const needsUpdate = hit.assetAutomationStatus !== 'OPTED_IN';
    hit.assetAutomationStatus = 'OPTED_IN';
    return { next, needsUpdate };
  }
  next.push({
    assetAutomationType: TEXT_ASSET_AUTOMATION_TYPE,
    assetAutomationStatus: 'OPTED_IN',
  });
  return { next, needsUpdate: true };
}

async function loadCampaign(
  env: AdsEnv,
  campaign: string,
): Promise<
  | {
      ok: true;
      resourceName: string;
      campaignId: string;
      automation: AssetAutomationSetting[];
      expansionOptedOut: boolean;
    }
  | { ok: false; error: string }
> {
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
  if (!search.ok) return { ok: false, error: search.error };
  if (!search.results.length) return { ok: false, error: `campaign not found: ${campaign}` };
  const row = search.results[0];
  const automation = parseAutomationSettings(pick(row, ['campaign', 'assetAutomationSettings']));
  const expansion = automation.find((a) => a.assetAutomationType === URL_EXPANSION_AUTOMATION_TYPE);
  return {
    ok: true,
    resourceName: str(pick(row, ['campaign', 'resourceName'])),
    campaignId: str(pick(row, ['campaign', 'id'])),
    automation,
    expansionOptedOut: expansion?.assetAutomationStatus === 'OPTED_OUT',
  };
}

async function loadLinkedPageFeedUrls(
  env: AdsEnv,
  campaign: string,
): Promise<
  | {
      ok: true;
      campaignAssetSetRn: string | null;
      assetSetRn: string | null;
      assetSetName: string | null;
      pageUrls: string[];
      assetByUrl: Map<string, string>;
    }
  | { ok: false; error: string }
> {
  const escaped = campaign.replace(/'/g, "\\'");
  const casRes = await adsSearch(
    env,
    `
    SELECT
      campaign_asset_set.resource_name,
      campaign_asset_set.asset_set,
      asset_set.resource_name,
      asset_set.name,
      asset_set.type
    FROM campaign_asset_set
    WHERE campaign.name = '${escaped}'
    LIMIT 20
  `.trim(),
  );
  if (!casRes.ok) return { ok: false, error: casRes.error };

  let campaignAssetSetRn: string | null = null;
  let assetSetRn: string | null = null;
  let assetSetName: string | null = null;
  for (const r of casRes.results) {
    const type = str(pick(r, ['assetSet', 'type']));
    if (type === 'PAGE_FEED') {
      campaignAssetSetRn = str(pick(r, ['campaignAssetSet', 'resourceName']));
      assetSetRn = str(pick(r, ['assetSet', 'resourceName']));
      assetSetName = str(pick(r, ['assetSet', 'name']));
      break;
    }
  }

  if (!assetSetRn) {
    const byName = await adsSearch(
      env,
      `
      SELECT asset_set.resource_name, asset_set.name, asset_set.type
      FROM asset_set
      WHERE asset_set.name = '${PAGE_FEED_ASSET_SET_NAME.replace(/'/g, "\\'")}'
        AND asset_set.type = 'PAGE_FEED'
      LIMIT 5
    `.trim(),
    );
    if (byName.ok && byName.results.length) {
      assetSetRn = str(pick(byName.results[0], ['assetSet', 'resourceName']));
      assetSetName = str(pick(byName.results[0], ['assetSet', 'name']));
    }
  }

  const pageUrls: string[] = [];
  const assetByUrl = new Map<string, string>();

  if (assetSetRn) {
    const escapedSet = assetSetRn.replace(/'/g, "\\'");
    const asaRes = await adsSearch(
      env,
      `
      SELECT
        asset_set_asset.asset,
        asset.page_feed_asset.page_url,
        asset.resource_name
      FROM asset_set_asset
      WHERE asset_set_asset.asset_set = '${escapedSet}'
      LIMIT 100
    `.trim(),
    );
    if (!asaRes.ok) return { ok: false, error: asaRes.error };
    for (const r of asaRes.results) {
      const url = str(pick(r, ['asset', 'pageFeedAsset', 'pageUrl']));
      const arn = str(pick(r, ['asset', 'resourceName']));
      if (url) {
        pageUrls.push(url);
        if (arn) assetByUrl.set(normalizePageFeedUrl(url), arn);
      }
    }
  }

  return {
    ok: true,
    campaignAssetSetRn,
    assetSetRn,
    assetSetName,
    pageUrls,
    assetByUrl,
  };
}

async function findExistingAssetsForUrls(
  env: AdsEnv,
  urls: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!urls.length) return out;
  const quoted = urls.map((u) => `'${u.replace(/'/g, "\\'")}'`).join(', ');
  const res = await adsSearch(
    env,
    `
    SELECT asset.resource_name, asset.page_feed_asset.page_url
    FROM asset
    WHERE asset.page_feed_asset.page_url IN (${quoted})
    LIMIT 50
  `.trim(),
  );
  if (!res.ok) return out;
  for (const r of res.results) {
    const url = str(pick(r, ['asset', 'pageFeedAsset', 'pageUrl']));
    const arn = str(pick(r, ['asset', 'resourceName']));
    if (url && arn) out.set(normalizePageFeedUrl(url), arn);
  }
  return out;
}

export async function applyPmaxPageFeed(
  env: AdsEnv,
  opts?: { campaign?: string; dryRun?: boolean },
): Promise<Record<string, unknown>> {
  const campaign = (opts?.campaign ?? PMAX_PAGE_FEED_CAMPAIGN).trim();
  const dryRun = opts?.dryRun !== false;
  if (campaign !== PMAX_PAGE_FEED_CAMPAIGN) {
    return {
      ok: false,
      error: `refusing campaign ${campaign}; only ${PMAX_PAGE_FEED_CAMPAIGN} is allowed`,
    };
  }

  const camp = await loadCampaign(env, campaign);
  if (!camp.ok) return { ok: false, stage: 'campaign', error: camp.error };

  const linked = await loadLinkedPageFeedUrls(env, campaign);
  if (!linked.ok) return { ok: false, stage: 'read_feed', error: linked.error };

  const textPlan = planTextAutomationOptIn(camp.automation);
  const missingInSet = planMissingPageFeedUrls(linked.pageUrls);
  const feedReady =
    Boolean(linked.assetSetRn) && urlsMatchFreezeSet(linked.pageUrls);
  const complete = linked.campaignAssetSetRn && feedReady;

  const snapshot = {
    ok: true,
    readOnly: dryRun,
    campaign,
    campaignId: camp.campaignId,
    expansionOptedOut: camp.expansionOptedOut,
    freezeUrls: [...FREEZE_PAGE_FEED_URLS],
    linkedPageUrls: linked.pageUrls,
    missingInLinkedSet: missingInSet,
    campaignAssetSet: linked.campaignAssetSetRn,
    assetSet: linked.assetSetRn,
    assetSetName: linked.assetSetName,
    textAutomation: camp.automation.find((a) => a.assetAutomationType === TEXT_ASSET_AUTOMATION_TYPE),
    textAutomationNeedsOptIn: textPlan.needsUpdate,
    complete,
  };

  if (complete && !textPlan.needsUpdate) {
    return { ...snapshot, dryRun, mutated: false, message: 'Page feed already complete.' };
  }

  if (dryRun) {
    return {
      ...snapshot,
      dryRun: true,
      mutated: false,
      feedReady,
      wouldCreateAssets: missingInSet.length,
      wouldLinkCampaign: !linked.campaignAssetSetRn && feedReady,
      wouldCreateAssetSet: !linked.assetSetRn,
    };
  }

  const mutateLog: unknown[] = [];

  if (textPlan.needsUpdate) {
    const customerId = adsCustomerId(env);
    const textMut = await adsMutate(env, 'campaigns:mutate', {
      operations: [
        {
          update: {
            resourceName:
              camp.resourceName || `customers/${customerId}/campaigns/${camp.campaignId}`,
            assetAutomationSettings: textPlan.next,
          },
          updateMask: 'assetAutomationSettings',
        },
      ],
    });
    mutateLog.push({ step: 'text_automation_opt_in', mutate: textMut });
    if (!textMut.ok) {
      return { ...snapshot, ok: false, stage: 'text_automation', error: textMut.error, mutateLog };
    }
  }

  let assetSetRn = linked.assetSetRn;
  if (!assetSetRn) {
    const byName = await adsSearch(
      env,
      `
      SELECT asset_set.resource_name, asset_set.name
      FROM asset_set
      WHERE asset_set.name = '${PAGE_FEED_ASSET_SET_NAME.replace(/'/g, "\\'")}'
        AND asset_set.type = 'PAGE_FEED'
      LIMIT 5
    `.trim(),
    );
    if (byName.ok && byName.results.length) {
      assetSetRn = str(pick(byName.results[0], ['assetSet', 'resourceName']));
    }
  }
  if (!assetSetRn) {
    const setMut = await adsMutate(env, 'assetSets:mutate', {
      operations: [
        {
          create: {
            name: PAGE_FEED_ASSET_SET_NAME,
            type: 'PAGE_FEED',
          },
        },
      ],
    });
    mutateLog.push({ step: 'asset_set_create', mutate: setMut });
    if (!setMut.ok) {
      return { ...snapshot, ok: false, stage: 'asset_set', error: setMut.error, mutateLog };
    }
    const results = pick(setMut.data, ['results']) as unknown[];
    const rn = str(pick((results?.[0] as Record<string, unknown>) ?? {}, ['resourceName']));
    if (!rn) {
      return { ok: false, stage: 'asset_set', error: 'missing asset set resource name', mutateLog };
    }
    assetSetRn = rn;
  }

  const existingAssets = await findExistingAssetsForUrls(env, [...FREEZE_PAGE_FEED_URLS]);
  for (const [k, v] of linked.assetByUrl) existingAssets.set(k, v);

  const linkedKeys = new Set(linked.pageUrls.map(normalizePageFeedUrl));
  for (const url of FREEZE_PAGE_FEED_URLS) {
    const key = normalizePageFeedUrl(url);
    if (linkedKeys.has(key)) continue;
    let arn = existingAssets.get(key);
    if (!arn) {
      const assetMut = await adsMutate(env, 'assets:mutate', {
        operations: [
          {
            create: {
              pageFeedAsset: {
                pageUrl: url,
                labels: [PAGE_FEED_LABEL],
              },
            },
          },
        ],
      });
      mutateLog.push({ step: 'asset_create', url, mutate: assetMut });
      if (!assetMut.ok) {
        return { ...snapshot, ok: false, stage: 'asset', error: assetMut.error, mutateLog };
      }
      const results = pick(assetMut.data, ['results']) as unknown[];
      arn = str(pick((results?.[0] as Record<string, unknown>) ?? {}, ['resourceName']));
      if (arn) existingAssets.set(key, arn);
    }
    if (!arn) continue;
    const linkMut = await adsMutate(env, 'assetSetAssets:mutate', {
      operations: [
        {
          create: {
            assetSet: assetSetRn,
            asset: arn,
          },
        },
      ],
    });
    mutateLog.push({ step: 'asset_set_asset', url, mutate: linkMut });
    if (!linkMut.ok) {
      return { ...snapshot, ok: false, stage: 'asset_set_asset', error: linkMut.error, mutateLog };
    }
  }

  if (!linked.campaignAssetSetRn) {
    const customerId = adsCustomerId(env);
    const campRn =
      camp.resourceName || `customers/${customerId}/campaigns/${camp.campaignId}`;
    const casMut = await adsMutate(env, 'campaignAssetSets:mutate', {
      operations: [
        {
          create: {
            campaign: campRn,
            assetSet: assetSetRn,
          },
        },
      ],
    });
    mutateLog.push({ step: 'campaign_asset_set', mutate: casMut });
    if (!casMut.ok) {
      const err = casMut.error;
      const apiBlocked = err.includes('INCOMPATIBLE_ADVERTISING_CHANNEL_TYPE');
      const afterFeed = await loadLinkedPageFeedUrls(env, campaign);
      return {
        ...snapshot,
        ok: false,
        stage: 'campaign_asset_set',
        error: err,
        feedReady: afterFeed.ok && urlsMatchFreezeSet(afterFeed.pageUrls),
        apiBlockedCampaignLink: apiBlocked,
        operatorFallback: apiBlocked
          ? 'Ads UI: Epir_Forest-Dark → ustawienia kampanii → Page feeds → wybierz „EPIR PMax freeze page feed”. Feed i 4 URL są już w koncie.'
          : undefined,
        mutateLog,
      };
    }
  }

  const after = await loadLinkedPageFeedUrls(env, campaign);
  return {
    ...snapshot,
    dryRun: false,
    mutated: true,
    mutateLog,
    after: after.ok
      ? {
          pageUrls: after.pageUrls,
          complete: urlsMatchFreezeSet(after.pageUrls) && Boolean(after.campaignAssetSetRn),
        }
      : { error: after.ok ? undefined : after.error },
    customerId: adsCustomerId(env),
  };
}
