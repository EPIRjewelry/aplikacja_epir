import {KB_POLICY_UNAVAILABLE_REPLY, searchShopPoliciesViaMcp} from '../../buyer/kb-policies';
import type {GemmaActionContext, GemmaKbFacts} from './types';

export async function runKbAction(ctx: GemmaActionContext): Promise<GemmaKbFacts | null> {
  const query = ctx.intent.policy_query?.trim() || ctx.userText.trim();
  const result = await searchShopPoliciesViaMcp(ctx.env, query, {context: ctx.userText});
  if (!result.ok) {
    console.log(
      JSON.stringify({
        tag: 'gemma.kb',
        kb_reason: result.reason,
        kb_subreason: result.subreason ?? null,
        has_answer: false,
        sources_n: 0,
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
