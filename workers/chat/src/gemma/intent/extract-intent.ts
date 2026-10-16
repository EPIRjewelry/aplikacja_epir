import type {Env} from '../../config/bindings';
import {getGroqResponse, type GroqMessage} from '../../ai-client';
import {withLlmRound0Retry} from '../../buyer/buyer-llm-retry';
import type {BuyerHistoryEntry} from '../../buyer/session-history';
import {parseIntentJson, type ParseIntentResult} from './parse-intent';
import type {GemmaIntent} from './schema';
import {GemmaTurnError} from '../errors';

const INTENT_SYSTEM = `Jesteś parserem intencji Gemma v2. Odpowiadasz WYŁĄCZNIE jednym obiektem JSON (bez markdown).
Pola (wszystkie wymagane): state, slots, product_ref, variant_choice, cart_action, cart_consent, policy_query, safety.
state: jeden z powitanie|potrzeby|propozycje|szczegoly|koszyk|polityki_kontakt|odmowa.
slots: obiekt z opcjonalnymi kluczami budget, metal, stone, product_type, occasion, recipient (string lub null).
product_ref, variant_choice, policy_query: string lub null.
cart_action: add|change|remove|show lub null.
cart_consent: boolean lub null.
safety: ok lub refuse.`;

export type ExtractIntentResult =
  | {ok: true; intent: GemmaIntent}
  | {ok: false; kind: 'parse'};

function buildIntentMessages(
  userText: string,
  history: BuyerHistoryEntry[],
): GroqMessage[] {
  const messages: GroqMessage[] = [{role: 'system', content: INTENT_SYSTEM}];
  for (const entry of history.slice(-6)) {
    messages.push({role: entry.role, content: entry.content});
  }
  messages.push({role: 'user', content: userText});
  return messages;
}

async function callIntentModel(
  env: Env,
  messages: GroqMessage[],
  sessionId?: string,
): Promise<string> {
  return withLlmRound0Retry(0, () =>
    getGroqResponse(messages, env, {
      timingLabel: 'buyer_gemma_intent',
      max_tokens: 512,
      sessionId,
    }),
  );
}

function unwrapParse(result: ParseIntentResult): ExtractIntentResult {
  if (!result.ok) {
    return {ok: false, kind: 'parse'};
  }
  return {ok: true, intent: result.intent};
}

export async function extractGemmaIntent(params: {
  env: Env;
  userText: string;
  history: BuyerHistoryEntry[];
  sessionId?: string;
}): Promise<ExtractIntentResult> {
  const messages = buildIntentMessages(params.userText, params.history);
  let firstRaw: string;
  try {
    firstRaw = await callIntentModel(params.env, messages, params.sessionId);
  } catch (e) {
    throw new GemmaTurnError('intent_transport', e);
  }
  const first = parseIntentJson(firstRaw);
  if (first.ok) {
    return {ok: true, intent: first.intent};
  }

  console.log(JSON.stringify({tag: 'gemma.intent.parse_retry'}));
  let retryRaw: string;
  try {
    retryRaw = await callIntentModel(params.env, messages, params.sessionId);
  } catch (e) {
    throw new GemmaTurnError('intent_transport', e);
  }
  return unwrapParse(parseIntentJson(retryRaw));
}
