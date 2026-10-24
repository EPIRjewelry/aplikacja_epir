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
  for (const row of searched.trace) {
    logKbAttempt(row, searched.attempts, searched.kb_retry, userText.length);
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
