/**
 * Customer Match upload — deleguje do Data Manager API (EPIR_CRM_* listy).
 */
import type { AdsEnv } from './ads';
import { segmentKeyByListName } from './customer-match-config';
import { uploadCustomerMatchViaDataManager } from './customer-match-dm';

export { auditCrmUserLists } from './customer-match-dm';

export type CustomerMatchUploadInput = {
  listName: string;
  description?: string;
  /** Lowercase hex SHA-256 of normalized email (no prefix). */
  hashedEmails: string[];
  dryRun?: boolean;
  membershipLifeSpan?: number;
};

export type CustomerMatchUploadResult = {
  dryRun: boolean;
  listName: string;
  inputCount: number;
  uniqueCount: number;
  userListResourceName?: string;
  jobResourceName?: string;
  operationsAdded?: number;
  jobRun?: boolean;
  error?: string;
};

function dedupeHashes(hashes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hashes) {
    const key = h.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export async function uploadCustomerMatchList(
  env: AdsEnv,
  input: CustomerMatchUploadInput,
): Promise<CustomerMatchUploadResult> {
  const dryRun = input.dryRun !== false;
  const unique = dedupeHashes(input.hashedEmails);
  const base: CustomerMatchUploadResult = {
    dryRun,
    listName: input.listName,
    inputCount: input.hashedEmails.length,
    uniqueCount: unique.length,
  };

  if (unique.length === 0) {
    return { ...base, error: 'no valid hashed emails' };
  }

  const segmentKey = segmentKeyByListName(input.listName);
  if (!segmentKey) {
    return {
      ...base,
      error: `unknown listName ${input.listName} — use EPIR_CRM_* from customer-match-config`,
    };
  }

  const dm = await uploadCustomerMatchViaDataManager(env, segmentKey, unique, dryRun);
  const customerId = (env.GOOGLE_ADS_CUSTOMER_ID ?? '').replace(/-/g, '').trim();
  return {
    dryRun,
    listName: input.listName,
    inputCount: dm.inputCount,
    uniqueCount: dm.uniqueCount,
    userListResourceName: customerId
      ? `customers/${customerId}/userLists/${dm.userListId}`
      : undefined,
    operationsAdded: dm.membersSent,
    jobRun: !dryRun && !dm.error,
    error: dm.error,
  };
}
