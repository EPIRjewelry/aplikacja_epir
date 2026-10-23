import {KB_POLICY_UNAVAILABLE_REPLY, searchShopPoliciesViaMcp} from '../../buyer/kb-policies';
import {CONTACT_KB_BROAD_QUERY, shouldTryBroadContactKbQuery} from '../kb-contact-search';
import type {GemmaActionContext, GemmaKbFacts} from './types';

function logGemmaKb(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({tag: 'gemma.kb', ...payload}));
}

export async function runKbAction(ctx: GemmaActionContext): Promise<GemmaKbFacts | null> {
  const policyQuery = ctx.intent.policy_query?.trim() || '';
  const userText = ctx.userText.trim();
  const primaryQuery = policyQuery || userText;
  const queriesTried: string[] = [];
  let kbRetry = false;

  const trySearch = async (query: string) => {
    queriesTried.push(query);
    return searchShopPoliciesViaMcp(ctx.env, query, {context: userText});
  };

  let result = await trySearch(primaryQuery);

  if (
    !result.ok &&
    result.reason === 'empty' &&
    policyQuery &&
    userText &&
    policyQuery !== userText
  ) {
    kbRetry = true;
    result = await trySearch(userText);
  }

  if (
    !result.ok &&
    result.reason === 'empty' &&
    shouldTryBroadContactKbQuery(userText) &&
    !queriesTried.includes(CONTACT_KB_BROAD_QUERY)
  ) {
    kbRetry = true;
    result = await trySearch(CONTACT_KB_BROAD_QUERY);
  }

  if (!result.ok) {
    logGemmaKb({
      kb_reason: result.reason,
      kb_subreason: result.subreason ?? null,
      has_answer: false,
      sources_n: 0,
      kb_retry: kbRetry,
      kb_queries: queriesTried,
      kb_primary_query: primaryQuery,
    });
    return null;
  }
  logGemmaKb({
    kb_reason: 'ok',
    has_answer: true,
    sources_n: result.sources.length,
    kb_retry: kbRetry,
    kb_queries: queriesTried,
    kb_primary_query: primaryQuery,
  });
  return {
    answer: result.answer,
    sources: result.sources,
  };
}

export function kbUnavailableReply(): string {
  return KB_POLICY_UNAVAILABLE_REPLY;
}
