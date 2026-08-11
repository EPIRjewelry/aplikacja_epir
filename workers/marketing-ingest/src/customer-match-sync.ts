/**
 * Pełny sync CRM: Shopify → segmenty → Data Manager → (opcjonalnie) audience signals.
 */
import type { AdsEnv } from './ads';
import {
  resolveSegmentKeys,
  segmentFilter,
  type CrmSegmentKey,
} from './customer-match-config';
import { hashEmailForCustomerMatch } from './customer-match-pii';
import { uploadCustomerMatchViaDataManager } from './customer-match-dm';
import { fetchShopifyCustomers, type ShopifyEnv } from './shopify-customers';
import {
  applyPmaxAudienceSignals,
  auditPmaxAudienceSignals,
} from './pmax-audience-signals';

export type CustomerMatchSyncEnv = AdsEnv & ShopifyEnv;

export type CustomerMatchSyncResult = {
  dryRun: boolean;
  shopifyCount: number;
  uploads: Awaited<ReturnType<typeof uploadCustomerMatchViaDataManager>>[];
  audienceSignals?: Awaited<ReturnType<typeof applyPmaxAudienceSignals>>[];
  error?: string;
};

async function hashSegment(
  customers: Awaited<ReturnType<typeof fetchShopifyCustomers>> extends { ok: true; customers: infer C }
    ? C
    : never,
  segmentKey: CrmSegmentKey,
): Promise<string[]> {
  const hashes: string[] = [];
  const seen = new Set<string>();
  for (const row of customers) {
    if (!segmentFilter(segmentKey, row)) continue;
    const h = await hashEmailForCustomerMatch(row.email);
    if (!h || seen.has(h)) continue;
    seen.add(h);
    hashes.push(h);
  }
  return hashes;
}

export async function syncCustomerMatch(
  env: CustomerMatchSyncEnv,
  opts?: {
    dryRun?: boolean;
    segment?: string;
    attachSignals?: boolean;
    campaignName?: string;
  },
): Promise<CustomerMatchSyncResult> {
  const dryRun = opts?.dryRun !== false;
  const attachSignals = opts?.attachSignals !== false;
  const campaignName = opts?.campaignName?.trim() || 'Epir_Forest-Dark';

  const fetched = await fetchShopifyCustomers(env);
  if (!fetched.ok) {
    return { dryRun, shopifyCount: 0, uploads: [], error: fetched.error };
  }

  let segmentKeys: CrmSegmentKey[];
  try {
    segmentKeys = resolveSegmentKeys(opts?.segment);
  } catch (e) {
    return {
      dryRun,
      shopifyCount: fetched.customers.length,
      uploads: [],
      error: String(e),
    };
  }

  const uploads: CustomerMatchSyncResult['uploads'] = [];
  for (const key of segmentKeys) {
    const hashes = await hashSegment(fetched.customers, key);
    uploads.push(await uploadCustomerMatchViaDataManager(env, key, hashes, dryRun));
  }

  const failedUpload = uploads.find((u) => u.error);
  if (failedUpload?.error && !dryRun) {
    return {
      dryRun,
      shopifyCount: fetched.customers.length,
      uploads,
      error: failedUpload.error,
    };
  }

  const audienceSignals: CustomerMatchSyncResult['audienceSignals'] = [];
  if (attachSignals) {
    for (const ag of ['EPIR_Srebro', 'EPIR_Zloto'] as const) {
      audienceSignals.push(
        await applyPmaxAudienceSignals(env, {
          campaignName,
          assetGroupName: ag,
          dryRun,
        }),
      );
    }
  }

  return {
    dryRun,
    shopifyCount: fetched.customers.length,
    uploads,
    audienceSignals,
  };
}

export { auditPmaxAudienceSignals };
