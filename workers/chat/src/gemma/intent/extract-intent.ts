import type {Env} from '../../config/bindings';
import {AiGatewayHttpError, getGroqResponse, type GroqMessage} from '../../ai-client';
import {BuyerTurnOverloadError, withLlmRound0Retry} from '../../buyer/buyer-llm-retry';
import type {BuyerHistoryEntry} from '../../buyer/session-history';
import {parseIntentJson, type ParseIntentResult} from './parse-intent';
import type {GemmaIntent} from './schema';
import {GemmaTurnError} from '../errors';
import {GEMMA_INTENT_TIMEOUT_MS} from './constants';
import {GEMMA_INTENT_RESPONSE_FORMAT} from './intent-json-schema';

const INTENT_SYSTEM = `Jesteś parserem intencji Gemma v2. Odpowiadasz WYŁĄCZNIE jednym obiektem JSON (bez markdown).
Pola (wszystkie wymagane): state, slots, product_ref, variant_choice, cart_action, cart_consent, policy_query, safety.
state: jeden z powitanie|potrzeby|propozycje|szczegoly|koszyk|polityki_kontakt|odmowa.
slots: obiekt z opcjonalnymi kluczami budget, metal, stone, product_type, occasion, recipient (string lub null).
product_ref, variant_choice, policy_query: string lub null.
cart_action: add|change|remove|show lub null.
cart_consent: boolean lub null.
safety: ok lub refuse.
Zasady:
- Gdy klient tylko dziękuje lub domyka rozmowę bez nowej prośby: state=powitanie, slots.occasion=podziękowanie, cart_action=null, bez nowego wyszukiwania.
- Gdy klient pyta o biżuterię na zamówienie indywidualne, odcisk palca lub własny projekt: state=propozycje, slots.product_type=zamówienie indywidualne, cart_action=null.
- Gdy klient szuka luksusowej biżuterii bez kwoty: slots.budget zawiera słowo luksus (np. luksus, luksusowa).
- policy_query: pełne pytanie klienta w języku naturalnym (całe zdanie), nie pojedyncze słowo-klucz.
- Kolejne pytanie o zamówienie indywidualne (czas realizacji, cena, materiał, możliwości): ustaw policy_query na to pytanie, bez slots.product_type=zamówienie indywidualne.
- cart_action=show tylko gdy klient prosi o pokazanie lub podsumowanie koszyka; „pokaż coś z…” / propozycje z katalogu to wyszukiwanie (cart_action=null).
- „dodaj do koszyka” / „wrzuć do koszyka” → cart_action=add, cart_consent=true.
- Klient woli dodać sam, albo podaje rozmiar/wariant po kartach bez prośby o dodanie → cart_action=add, cart_consent=false.
- Bez wyraźnej prośby o koszyk: cart_action=null.
- Gdy klient nazwał opcję wariantu: variant_choice jako JSON [{"name":"…","value":"…"}] (np. Rozmiar / 14).`;

/** Eksport wyłącznie pod testy promptu A. */
export const GEMMA_INTENT_SYSTEM_PROMPT = INTENT_SYSTEM;

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

function logIntentTransportError(e: unknown): void {
  const payload: Record<string, unknown> = {tag: 'gemma.intent.error'};
  if (e instanceof AiGatewayHttpError) payload.http_status = e.status;
  if (e instanceof Error) payload.error_name = e.name;
  console.log(JSON.stringify(payload));
}

async function callIntentModel(
  env: Env,
  messages: GroqMessage[],
  sessionId?: string,
): Promise<string> {
  return withLlmRound0Retry(0, () =>
    getGroqResponse(messages, env, {
      timingLabel: 'buyer_gemma_intent',
      sessionId,
      responseFormat: GEMMA_INTENT_RESPONSE_FORMAT,
      timeoutMs: GEMMA_INTENT_TIMEOUT_MS,
    }),
  );
}

function unwrapParse(result: ParseIntentResult): ExtractIntentResult {
  if (!result.ok) {
    return {ok: false, kind: 'parse'};
  }
  return {ok: true, intent: result.intent};
}

/** Overload (BuyerTurnOverloadError) idzie dalej bez zmian — osobny komunikat w handle-buyer-turn. */
function wrapIntentTransportError(e: unknown): Error {
  if (e instanceof BuyerTurnOverloadError) return e;
  logIntentTransportError(e);
  return new GemmaTurnError('intent_transport', e);
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
    throw wrapIntentTransportError(e);
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
    throw wrapIntentTransportError(e);
  }
  return unwrapParse(parseIntentJson(retryRaw));
}
