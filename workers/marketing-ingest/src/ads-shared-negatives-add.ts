/**
 * Add PHRASE negatives to shared list "Safety Filter - Marki" (Search + PMax).
 * Create-only; never deletes or detaches. Refuses jubiler variants.
 */
import type { AdsEnv } from './ads';
import { adsCustomerId, adsMutate, adsSearch } from './ads-api';

export const SAFETY_FILTER_MARKI = 'Safety Filter - Marki';

/** Operator-approved 2026-09-24 — one batch; no jubiler. */
export const SHARED_MARKI_NEGATIVES_PHRASE = [
  'kamyki moniki',
  'kamyki monika',
  'vintage',
  'używane',
  'uzywane',
  'second hand',
  'secondhand',
  'stare pierścionki',
  'brylanty używane',
  'komis',
  'allegro używane',
  'olx',
  'w starym stylu',
  'shambala',
  'bijou brigitte',
  'bijou mima',
  'lovrin',
  'jacek byczewski',
  'marieta żukowska',
  'andel',
  'azzurro',
  'bursztynowa galeria',
  'motyle biżuteria',
  'prana',
  'zultanite',
  'zultanit',
  'sułtanit',
  'biżuteria stal',
  'dystrybutor biżuterii',
] as const;

const FORBIDDEN = ['jubiler', 'jubiler wrocław', 'jubiler wroclaw'];

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

function norm(text: string): string {
  return text.trim().toLowerCase();
}

export function refuseForbiddenKeywords(keywords: string[]): string[] {
  return keywords.filter((k) => FORBIDDEN.some((f) => norm(k) === f));
}

export function planMissingSharedNegatives(
  existing: string[],
  proposed: readonly string[] = SHARED_MARKI_NEGATIVES_PHRASE,
): string[] {
  const have = new Set(existing.map(norm));
  return proposed.filter((k) => !have.has(norm(k)));
}

export async function addSharedMarkiNegatives(
  env: AdsEnv,
  opts?: { dryRun?: boolean; listName?: string; keywords?: string[] },
): Promise<Record<string, unknown>> {
  const dryRun = opts?.dryRun !== false;
  const listName = (opts?.listName ?? SAFETY_FILTER_MARKI).trim();
  const keywords = opts?.keywords?.length
    ? opts.keywords
    : [...SHARED_MARKI_NEGATIVES_PHRASE];

  const forbiddenHit = refuseForbiddenKeywords(keywords);
  if (forbiddenHit.length) {
    return {
      ok: false,
      error: `refusing forbidden keywords: ${forbiddenHit.join(', ')}`,
      willNotDo: FORBIDDEN,
    };
  }

  const escaped = listName.replace(/'/g, "\\'");
  const setRes = await adsSearch(
    env,
    `
    SELECT shared_set.id, shared_set.name, shared_set.member_count, shared_set.resource_name, shared_set.status
    FROM shared_set
    WHERE shared_set.type = 'NEGATIVE_KEYWORDS'
      AND shared_set.name = '${escaped}'
      AND shared_set.status != 'REMOVED'
    LIMIT 5
  `.trim(),
  );
  if (!setRes.ok) return { ok: false, stage: 'shared_set', error: setRes.error };
  if (!setRes.results.length) {
    return { ok: false, error: `shared set not found: ${listName}` };
  }

  const setRow = setRes.results[0];
  const sharedSetId = str(pick(setRow, ['sharedSet', 'id']));
  const sharedSetRn = str(pick(setRow, ['sharedSet', 'resourceName']));
  const memberCountBefore = Number(pick(setRow, ['sharedSet', 'memberCount']) ?? 0);

  const membersRes = await adsSearch(
    env,
    `
    SELECT
      shared_criterion.resource_name,
      shared_criterion.keyword.text,
      shared_criterion.keyword.match_type,
      shared_set.id,
      shared_set.name
    FROM shared_criterion
    WHERE shared_set.id = ${sharedSetId}
    LIMIT 1000
  `.trim(),
  );
  if (!membersRes.ok) return { ok: false, stage: 'shared_criterion', error: membersRes.error };

  const existing = membersRes.results.map((r) => str(pick(r, ['sharedCriterion', 'keyword', 'text'])));
  const missing = planMissingSharedNegatives(existing, keywords);

  const snapshot = {
    ok: true,
    listName,
    sharedSetId,
    sharedSetRn,
    memberCountBefore,
    existingCount: existing.length,
    proposed: keywords,
    missing,
    alreadyPresent: keywords.filter((k) => !missing.includes(k)),
    matchType: 'PHRASE',
    willNotDo: FORBIDDEN,
  };

  if (!missing.length) {
    return { ...snapshot, dryRun, mutated: false, message: 'All keywords already on list.' };
  }

  if (dryRun) {
    return { ...snapshot, dryRun: true, mutated: false, planCount: missing.length };
  }

  const customerId = adsCustomerId(env);
  const sharedSet =
    sharedSetRn || `customers/${customerId}/sharedSets/${sharedSetId}`;
  const mutateResults: unknown[] = [];

  for (const keyword of missing) {
    const mutated = await adsMutate(env, 'sharedCriteria:mutate', {
      operations: [
        {
          create: {
            sharedSet,
            keyword: {
              text: keyword,
              matchType: 'PHRASE',
            },
          },
        },
      ],
    });
    mutateResults.push({ keyword, mutate: mutated });
    if (!mutated.ok) {
      return {
        ok: false,
        stage: 'mutate',
        error: mutated.error,
        ...snapshot,
        dryRun: false,
        mutated: false,
        mutateResults,
      };
    }
  }

  const after = await adsSearch(
    env,
    `
    SELECT shared_set.id, shared_set.name, shared_set.member_count
    FROM shared_set
    WHERE shared_set.id = ${sharedSetId}
    LIMIT 1
  `.trim(),
  );

  return {
    ...snapshot,
    dryRun: false,
    mutated: true,
    mutateResults,
    memberCountAfter: after.ok
      ? Number(pick(after.results[0], ['sharedSet', 'memberCount']) ?? 0)
      : null,
  };
}
