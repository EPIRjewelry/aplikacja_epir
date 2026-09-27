/**
 * Read-only snapshot: conversion actions, campaign goals, change_event (Ads account).
 * No mutates.
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

export async function auditAdsAccountChanges(env: AdsEnv): Promise<Record<string, unknown>> {
  const conversionActions = await adsSearch(
    env,
    `
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.type,
      conversion_action.category,
      conversion_action.status,
      conversion_action.primary_for_goal,
      conversion_action.include_in_conversions_metric,
      conversion_action.origin
    FROM conversion_action
    WHERE conversion_action.status != 'REMOVED'
    ORDER BY conversion_action.name
    LIMIT 200
  `.trim(),
  );

  const campaignGoals = await adsSearch(
    env,
    `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign_conversion_goal.category,
      campaign_conversion_goal.origin,
      campaign_conversion_goal.biddable
    FROM campaign_conversion_goal
    WHERE campaign.name IN ('Epir_Forest-Dark', 'Search-27.04.2026')
      AND campaign.status != 'REMOVED'
    LIMIT 200
  `.trim(),
  );

  const campaignsMeta = await adsSearch(
    env,
    `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.final_url_suffix,
      campaign.bidding_strategy_type,
      campaign.network_settings.target_google_search,
      campaign.network_settings.target_search_network,
      campaign.network_settings.target_content_network,
      campaign.network_settings.target_partner_search_network,
      campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.name IN ('Epir_Forest-Dark', 'Search-27.04.2026')
      AND campaign.status != 'REMOVED'
    LIMIT 20
  `.trim(),
  );

  const assetGroups = await adsSearch(
    env,
    `
    SELECT
      asset_group.id,
      asset_group.name,
      asset_group.status,
      asset_group.final_urls,
      campaign.name
    FROM asset_group
    WHERE campaign.name = 'Epir_Forest-Dark'
      AND asset_group.status != 'REMOVED'
    LIMIT 50
  `.trim(),
  );

  // change_event: explicit window within 30 days (LAST_30_DAYS enum can fail START_DATE_TOO_OLD)
  const changes = await adsSearch(
    env,
    `
    SELECT
      change_event.change_date_time,
      change_event.change_resource_type,
      change_event.change_resource_name,
      change_event.client_type,
      change_event.user_email,
      change_event.resource_change_operation,
      change_event.changed_fields
    FROM change_event
    WHERE change_event.change_date_time >= '2026-08-22'
      AND change_event.change_date_time <= '2026-09-20'
    ORDER BY change_event.change_date_time DESC
    LIMIT 500
  `.trim(),
  );

  const actionRows = conversionActions.ok
    ? conversionActions.results.map((r) => ({
        id: str(pick(r, ['conversionAction', 'id'])),
        name: str(pick(r, ['conversionAction', 'name'])),
        type: str(pick(r, ['conversionAction', 'type'])),
        category: str(pick(r, ['conversionAction', 'category'])),
        status: str(pick(r, ['conversionAction', 'status'])),
        primaryForGoal: pick(r, ['conversionAction', 'primaryForGoal']),
        includeInConversionsMetric: pick(r, ['conversionAction', 'includeInConversionsMetric']),
        origin: str(pick(r, ['conversionAction', 'origin'])),
      }))
    : { error: conversionActions.error };

  const goalRows = campaignGoals.ok
    ? campaignGoals.results.map((r) => ({
        campaign: str(pick(r, ['campaign', 'name'])),
        campaignStatus: str(pick(r, ['campaign', 'status'])),
        category: str(pick(r, ['campaignConversionGoal', 'category'])),
        origin: str(pick(r, ['campaignConversionGoal', 'origin'])),
        biddable: pick(r, ['campaignConversionGoal', 'biddable']),
      }))
    : { error: campaignGoals.error };

  const campRows = campaignsMeta.ok
    ? campaignsMeta.results.map((r) => ({
        id: str(pick(r, ['campaign', 'id'])),
        name: str(pick(r, ['campaign', 'name'])),
        status: str(pick(r, ['campaign', 'status'])),
        channel: str(pick(r, ['campaign', 'advertisingChannelType'])),
        finalUrlSuffix: str(pick(r, ['campaign', 'finalUrlSuffix'])),
        bidding: str(pick(r, ['campaign', 'biddingStrategyType'])),
        budgetMicros: pick(r, ['campaignBudget', 'amountMicros']),
        networkSettings: {
          targetGoogleSearch: pick(r, ['campaign', 'networkSettings', 'targetGoogleSearch']),
          targetSearchNetwork: pick(r, ['campaign', 'networkSettings', 'targetSearchNetwork']),
          targetContentNetwork: pick(r, ['campaign', 'networkSettings', 'targetContentNetwork']),
          targetPartnerSearchNetwork: pick(r, [
            'campaign',
            'networkSettings',
            'targetPartnerSearchNetwork',
          ]),
        },
      }))
    : { error: campaignsMeta.error };

  const networkSettings = Array.isArray(campRows)
    ? campRows.map((c) => ({
        campaign: c.name,
        channel: c.channel,
        ...c.networkSettings,
      }))
    : { error: (campRows as { error: string }).error };

  const agRows = assetGroups.ok
    ? assetGroups.results.map((r) => ({
        id: str(pick(r, ['assetGroup', 'id'])),
        name: str(pick(r, ['assetGroup', 'name'])),
        status: str(pick(r, ['assetGroup', 'status'])),
        finalUrls: pick(r, ['assetGroup', 'finalUrls']) ?? [],
        campaign: str(pick(r, ['campaign', 'name'])),
      }))
    : { error: assetGroups.error };

  const changeRows = changes.ok
    ? changes.results.map((r) => ({
        at: str(pick(r, ['changeEvent', 'changeDateTime'])),
        resourceType: str(pick(r, ['changeEvent', 'changeResourceType'])),
        resourceName: str(pick(r, ['changeEvent', 'changeResourceName'])),
        client: str(pick(r, ['changeEvent', 'clientType'])),
        user: str(pick(r, ['changeEvent', 'userEmail'])),
        op: str(pick(r, ['changeEvent', 'resourceChangeOperation'])),
        fields: pick(r, ['changeEvent', 'changedFields']),
      }))
    : { error: changes.error };

  const byType: Record<string, number> = {};
  if (Array.isArray(changeRows)) {
    for (const c of changeRows) {
      const k = c.resourceType || '?';
      byType[k] = (byType[k] || 0) + 1;
    }
  }

  return {
    ok: true,
    readOnly: true,
    fetchedAt: new Date().toISOString(),
    conversionActions: actionRows,
    campaignConversionGoals: goalRows,
    campaigns: campRows,
    networkSettings,
    assetGroups: agRows,
    changeEventLast30Days: {
      error: Array.isArray(changeRows) ? null : (changeRows as { error: string }).error,
      count: Array.isArray(changeRows) ? changeRows.length : 0,
      byResourceType: byType,
      rows: Array.isArray(changeRows) ? changeRows : [],
    },
  };
}
