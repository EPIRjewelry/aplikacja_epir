import type {PolicyMcpResult} from '../../buyer/kb-policies';
import {searchShopPoliciesViaMcp} from '../../buyer/kb-policies';
import type {Env} from '../../config/bindings';

function uniqueQueries(candidates: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const q = c.trim();
    if (!q || seen.has(q)) continue;
    seen.add(q);
    out.push(q);
  }
  return out;
}

/** Prefer dłuższe pytanie NL (pełne zdanie klienta) nad skrótem z policy_query. */
export function pickPrimaryKbQuery(policyQuery: string, userText: string): string {
  const p = policyQuery.trim();
  const u = userText.trim();
  if (!p) return u;
  if (!u) return p;
  if (p === u) return p;
  return u.length > p.length ? u : p;
}

export function buildKbQueryAttempts(policyQuery: string, userText: string): string[] {
  const primary = pickPrimaryKbQuery(policyQuery, userText);
  const p = policyQuery.trim();
  const u = userText.trim();
  return uniqueQueries([primary, p, u]);
}

export async function searchKbWithQueryAttempts(
  env: Env,
  policyQuery: string,
  userText: string,
): Promise<{result: PolicyMcpResult; attempts: number; kb_retry: boolean}> {
  const queries = buildKbQueryAttempts(policyQuery, userText);
  let last: PolicyMcpResult = {ok: false, reason: 'empty'};
  for (let i = 0; i < queries.length; i++) {
    last = await searchShopPoliciesViaMcp(env, queries[i]!, {context: userText});
    if (last.ok) {
      return {result: last, attempts: i + 1, kb_retry: i > 0};
    }
    if (last.reason !== 'empty') {
      return {result: last, attempts: i + 1, kb_retry: i > 0};
    }
  }
  return {result: last, attempts: queries.length, kb_retry: queries.length > 1};
}
