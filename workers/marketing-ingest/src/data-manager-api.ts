/**
 * Google Data Manager API — Customer Match ingest (bez developer token allowlist).
 */
import type { AdsEnv } from './ads';
import { adsCustomerId } from './ads-api';
import { refreshGoogleAccessToken } from './google-oauth';

const DM_API = 'https://datamanager.googleapis.com/v1';
const BATCH_SIZE = 10_000;

export type DmDestination = {
  operatingAccountId: string;
  loginAccountId?: string;
  productDestinationId: string;
  reference: string;
};

export type DmIngestResult = {
  ok: boolean;
  validateOnly: boolean;
  membersSent: number;
  batches: number;
  error?: string;
  responses?: unknown[];
};

function dmHeaders(access: string): Record<string, string> {
  return {
    Authorization: `Bearer ${access}`,
    'Content-Type': 'application/json',
  };
}

export function buildGoogleAdsDestination(
  env: AdsEnv,
  userListId: string,
  reference: string,
): DmDestination {
  const operatingAccountId = adsCustomerId(env);
  const loginAccountId = (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '').trim();
  return {
    operatingAccountId,
    loginAccountId: loginAccountId || undefined,
    productDestinationId: userListId.replace(/\D/g, ''),
    reference,
  };
}

function destinationPayload(dest: DmDestination): Record<string, unknown> {
  const out: Record<string, unknown> = {
    operatingAccount: {
      accountType: 'GOOGLE_ADS',
      accountId: dest.operatingAccountId,
    },
    productDestinationId: dest.productDestinationId,
    reference: dest.reference,
  };
  if (dest.loginAccountId && dest.loginAccountId !== dest.operatingAccountId) {
    out.loginAccount = {
      accountType: 'GOOGLE_ADS',
      accountId: dest.loginAccountId,
    };
  }
  return out;
}

function memberFromHash(hashedEmail: string): Record<string, unknown> {
  return {
    compositeData: {
      userData: {
        userIdentifiers: [{ emailAddress: hashedEmail }],
      },
    },
  };
}

export async function ingestHashedEmails(
  env: AdsEnv,
  dest: DmDestination,
  hashedEmails: string[],
  opts?: { validateOnly?: boolean; dryRun?: boolean },
): Promise<DmIngestResult> {
  const validateOnly = opts?.validateOnly === true || opts?.dryRun === true;
  const unique = [...new Set(hashedEmails.map((h) => h.trim().toLowerCase()).filter((h) => /^[a-f0-9]{64}$/.test(h)))];
  if (unique.length === 0) {
    return { ok: false, validateOnly, membersSent: 0, batches: 0, error: 'no valid hashes' };
  }

  const accessRes = await refreshGoogleAccessToken(env);
  if (!accessRes.ok) {
    return { ok: false, validateOnly, membersSent: 0, batches: 0, error: accessRes.error };
  }

  const responses: unknown[] = [];
  let membersSent = 0;
  let batches = 0;

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    const body = {
      destinations: [destinationPayload(dest)],
      audienceMembers: chunk.map((h) => ({
        ...memberFromHash(h),
        destinationReferences: [dest.reference],
      })),
      consent: {
        adUserData: 'CONSENT_GRANTED',
        adPersonalization: 'CONSENT_GRANTED',
      },
      encoding: 'HEX',
      termsOfService: {
        customerMatchTermsOfServiceStatus: 'ACCEPTED',
      },
      validateOnly,
    };

    const res = await fetch(`${DM_API}/audienceMembers:ingest`, {
      method: 'POST',
      headers: dmHeaders(accessRes.token),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* keep text */
    }
    responses.push({ status: res.status, data });
    batches += 1;

    if (!res.ok) {
      return {
        ok: false,
        validateOnly,
        membersSent,
        batches,
        error: `HTTP ${res.status}: ${text.slice(0, 1200)}`,
        responses,
      };
    }
    membersSent += chunk.length;
  }

  return { ok: true, validateOnly, membersSent, batches, responses };
}
