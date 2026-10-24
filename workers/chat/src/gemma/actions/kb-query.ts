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

/** Pierwsze wywołanie MCP: przepisane policy_query. Surowy tekst jest dopiero drugą próbą. */
export function pickPrimaryKbQuery(policyQuery: string, userText: string): string {
  const p = policyQuery.trim();
  if (p) return p;
  return userText.trim();
}

/** Maks. 2 zapytania: policy_query, potem tekst klienta gdy różny. */
export function buildKbQueryAttempts(policyQuery: string, userText: string): string[] {
  const primary = pickPrimaryKbQuery(policyQuery, userText);
  const u = userText.trim();
  return uniqueQueries([primary, u]).slice(0, 2);
}

export type KbQueryAttempt = {attempt: number; result: PolicyMcpResult};

export async function searchKbWithQueryAttempts(
  env: Env,
  policyQuery: string,
  userText: string,
): Promise<{
  result: PolicyMcpResult;
  attempts: number;
  kb_retry: boolean;
  trace: KbQueryAttempt[];
}> {
  const queries = buildKbQueryAttempts(policyQuery, userText);
  const trace: KbQueryAttempt[] = [];
  let last: PolicyMcpResult = {ok: false, reason: 'empty'};
  for (let i = 0; i < queries.length; i++) {
    last = await searchShopPoliciesViaMcp(env, queries[i]!, {context: userText});
    trace.push({attempt: i + 1, result: last});
    if (last.ok || last.reason !== 'empty') break;
  }
  return {
    result: last,
    attempts: trace.length,
    kb_retry: trace.length > 1,
    trace,
  };
}
