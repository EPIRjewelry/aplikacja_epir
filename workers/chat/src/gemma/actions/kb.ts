import {KB_POLICY_UNAVAILABLE_REPLY, searchShopPoliciesViaMcp} from '../../buyer/kb-policies';
import type {GemmaActionContext, GemmaKbFacts} from './types';

export async function runKbAction(ctx: GemmaActionContext): Promise<GemmaKbFacts | null> {
  const policyQuery = ctx.intent.policy_query?.trim() || '';
  const userText = ctx.userText.trim();
  const primaryQuery = policyQuery || userText;
  let result = await searchShopPoliciesViaMcp(ctx.env, primaryQuery, {context: userText});
  let kbRetry = false;
  if (
    !result.ok &&
    result.reason === 'empty' &&
    policyQuery &&
    userText &&
    policyQuery !== userText
  ) {
    kbRetry = true;
    result = await searchShopPoliciesViaMcp(ctx.env, userText, {context: userText});
  }
  if (!result.ok) {
    console.log(
      JSON.stringify({
        tag: 'gemma.kb',
        kb_reason: result.reason,
        kb_subreason: result.subreason ?? null,
        has_answer: false,
        sources_n: 0,
        kb_retry: kbRetry,
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
