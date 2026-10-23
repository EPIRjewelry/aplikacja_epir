import {KB_POLICY_UNAVAILABLE_REPLY} from '../../buyer/kb-policies';
import {searchKbWithQueryAttempts} from './kb-query';
import type {GemmaActionContext, GemmaKbFacts} from './types';

export async function runKbAction(ctx: GemmaActionContext): Promise<GemmaKbFacts | null> {
  const policyQuery = ctx.intent.policy_query?.trim() || '';
  const userText = ctx.userText.trim();
  const {result, attempts, kb_retry: kbRetry} = await searchKbWithQueryAttempts(
    ctx.env,
    policyQuery,
    userText,
  );
  if (!result.ok) {
    console.log(
      JSON.stringify({
        tag: 'gemma.kb',
        kb_reason: result.reason,
        kb_subreason: result.subreason ?? null,
        has_answer: false,
        sources_n: 0,
        kb_retry: kbRetry,
        kb_attempts: attempts,
        query_len: userText.length,
      }),
    );
    return null;
  }
  console.log(
    JSON.stringify({
      tag: 'gemma.kb',
      kb_reason: 'ok',
      has_answer: true,
      sources_n: result.sources.length,
      kb_retry: kbRetry,
      kb_attempts: attempts,
      query_len: userText.length,
    }),
  );
  return {
    answer: result.answer,
    sources: result.sources,
  };
}

export function kbUnavailableReply(): string {
  return KB_POLICY_UNAVAILABLE_REPLY;
}
