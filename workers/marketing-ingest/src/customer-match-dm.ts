/**
 * Customer Match upload — primary path via Data Manager API.
 */
import type { AdsEnv } from './ads';
import { adsSearch } from './ads-api';
import { CRM_SEGMENTS, type CrmSegmentKey } from './customer-match-config';
import { buildGoogleAdsDestination, ingestHashedEmails } from './data-manager-api';

export type DmUploadResult = {
  dryRun: boolean;
  listName: string;
  segmentKey: CrmSegmentKey;
  userListId: string;
  inputCount: number;
  uniqueCount: number;
  membersSent?: number;
  batches?: number;
  via: 'data-manager';
  error?: string;
  validateOnly?: boolean;
};

async function resolveUserListId(env: AdsEnv, listName: string, fallbackId: string): Promise<string> {
  const q = `
    SELECT user_list.id, user_list.name
    FROM user_list
    WHERE user_list.name = '${listName.replace(/'/g, "\\'")}'
    LIMIT 1
  `;
  const res = await adsSearch(env, q);
  if (!res.ok) return fallbackId;
  const row = res.results[0] as { userList?: { id?: string } } | undefined;
  return String(row?.userList?.id ?? fallbackId);
}

export async function uploadCustomerMatchViaDataManager(
  env: AdsEnv,
  segmentKey: CrmSegmentKey,
  hashedEmails: string[],
  dryRun = true,
): Promise<DmUploadResult> {
  const seg = CRM_SEGMENTS[segmentKey];
  const unique = [...new Set(hashedEmails.map((h) => h.trim().toLowerCase()).filter((h) => /^[a-f0-9]{64}$/.test(h)))];
  const base: DmUploadResult = {
    dryRun,
    listName: seg.listName,
    segmentKey,
    userListId: seg.userListId,
    inputCount: hashedEmails.length,
    uniqueCount: unique.length,
    via: 'data-manager',
  };

  if (unique.length === 0) {
    return { ...base, error: 'no valid hashed emails' };
  }

  const userListId = await resolveUserListId(env, seg.listName, seg.userListId);
  const dest = buildGoogleAdsDestination(env, userListId, `crm_${segmentKey}`);
  const ingest = await ingestHashedEmails(env, dest, unique, {
    validateOnly: dryRun,
    dryRun,
  });

  if (!ingest.ok) {
    return {
      ...base,
      userListId,
      error: ingest.error,
      validateOnly: ingest.validateOnly,
      membersSent: ingest.membersSent,
      batches: ingest.batches,
    };
  }

  return {
    ...base,
    userListId,
    membersSent: ingest.membersSent,
    batches: ingest.batches,
    validateOnly: ingest.validateOnly,
  };
}

export async function auditCrmUserLists(env: AdsEnv) {
  const lists = Object.values(CRM_SEGMENTS);
  const names = lists.map((l) => `'${l.listName.replace(/'/g, "\\'")}'`).join(', ');
  const res = await adsSearch(
    env,
    `
    SELECT
      user_list.name,
      user_list.id,
      user_list.size_for_display,
      user_list.size_for_search,
      user_list.membership_status,
      user_list.match_rate_percentage
    FROM user_list
    WHERE user_list.name IN (${names})
  `.trim(),
  );
  if (!res.ok) return { ok: false as const, error: res.error };
  const rows = res.results.map((r) => {
    const ul = (r as { userList?: Record<string, unknown> }).userList ?? {};
    return {
      name: String(ul.name ?? ''),
      id: String(ul.id ?? ''),
      sizeForDisplay: Number(ul.sizeForDisplay ?? ul.size_for_display ?? 0),
      sizeForSearch: Number(ul.sizeForSearch ?? ul.size_for_search ?? 0),
      membershipStatus: String(ul.membershipStatus ?? ul.membership_status ?? ''),
      matchRatePercentage: ul.matchRatePercentage ?? ul.match_rate_percentage ?? null,
    };
  });
  const totalDisplay = rows.reduce((n, r) => n + r.sizeForDisplay, 0);
  return {
    ok: true as const,
    lists: rows,
    uploaded: totalDisplay > 0,
    note:
      'Google może pokazywać 0 dopóki lista ma <100 dopasowań (privacy rounding).',
  };
}
