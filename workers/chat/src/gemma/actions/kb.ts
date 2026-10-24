import {kbPolicyMissReply} from '../../buyer/kb-policies';
import {searchKbWithQueryAttempts, type KbQueryAttempt} from './kb-query';
import type {GemmaActionContext, GemmaKbFacts} from './types';

export type KbActionResult =
  | {ok: true; facts: GemmaKbFacts}
  | {ok: false; reason: 'empty' | 'mcp_error'};

function logKbAttempt(
  row: KbQueryAttempt,
  attempts: number,
  kbRetry: boolean,
  userTextLen: number,
): void {
  const ok = row.result.ok;
  console.log(
    JSON.stringify({
      tag: 'gemma.kb',
      kb_reason: ok ? 'ok' : row.result.reason,
      kb_subreason: ok ? null : (row.result.subreason ?? null),
      has_answer: ok,
      sources_n: ok ? row.result.sources.length : 0,
      kb_retry: kbRetry,
      kb_attempts: attempts,
      kb_attempt: row.attempt,
      query_len: userTextLen,
    }),
  );
}

export async function runKbAction(ctx: GemmaActionContext): Promise<KbActionResult> {
  const policyQuery = ctx.intent.policy_query?.trim() || '';
  const userText = ctx.userText.trim();
  const searched = await searchKbWithQueryAttempts(ctx.env, policyQuery, userText);
  const rows =
    searched.trace.length > 0
      ? searched.trace
      : [{attempt: 1, result: searched.result} satisfies KbQueryAttempt];
  for (const row of rows) {
    logKbAttempt(row, Math.max(searched.attempts, rows.length), searched.kb_retry, userText.length);
  }
  if (!searched.result.ok) {
    return {ok: false, reason: searched.result.reason};
  }
  return {
    ok: true,
    facts: {
      answer: searched.result.answer,
      sources: searched.result.sources,
    },
  };
}

export function kbUnavailableReply(reason: 'empty' | 'mcp_error' = 'mcp_error'): string {
  return kbPolicyMissReply(reason);
}
