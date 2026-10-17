import type {Env} from '../../config/bindings';
import {AiGatewayHttpError, getGroqResponse, type GroqMessage} from '../../ai-client';
import {GEMMA_FORMULATION_BUDGET_MS} from './constants';
import {GEMMA_FORMULATION_RESPONSE_FORMAT} from './formulation-json-schema';
import {parseFormulationJson} from './parse-formulation';
import type {TurnFacts} from './types';
import type {ParsedFormulation} from './types';

const FORMULATION_SYSTEM = `Jesteś asystentką sklepu EPIR Art Jewellery. Odpowiadasz WYŁĄCZNIE jednym obiektem JSON (bez markdown).
Pola: "text" (string), "product_refs" (tablica stringów, może być pusta).
Zasady:
- Forma łączna Pan/Pani (np. Proszę Pana/Panią), bez form na „ty”, bez samodzielnego Pan lub Pani.
- W "text" NIE wklejaj adresów URL, www, cen liczbowych ani numerów telefonu — używaj placeholderów {{g1}}, {{g1.price}} z listy refs.
- product_refs musi być podzbiorem dozwolonych refów z payloadu.
- Co najwyżej jedno pytanie (jeden znak ?).
- Nie wspominaj marki KAZKA.
- O produktach pisz tylko to, co jest w facts (title, available, cena przez placeholder); nie dopisuj cech spoza faktów.`;

class FormulationTimeoutError extends Error {
  constructor() {
    super('formulation_timeout');
    this.name = 'FormulationTimeoutError';
  }
}

function logFormulationError(e: unknown): void {
  const payload: Record<string, unknown> = {tag: 'gemma.formulation.error'};
  if (e instanceof AiGatewayHttpError) payload.http_status = e.status;
  if (e instanceof Error) payload.error_name = e.name;
  console.log(JSON.stringify(payload));
}

function isTimeoutLike(e: unknown): boolean {
  if (e instanceof FormulationTimeoutError) return true;
  if (e instanceof Error) {
    if (e.message === 'formulation_timeout') return true;
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  }
  return false;
}

function buildUserPayload(userText: string, turn: TurnFacts): string {
  return JSON.stringify({
    userText,
    state: turn.state,
    missingSlot: turn.missingSlot ?? null,
    facts: {
      products: turn.products,
      kbAnswer: turn.kbAnswer,
    },
    allowedRefs: turn.allowedRefs,
  });
}

async function callFormulationModel(
  env: Env,
  messages: GroqMessage[],
  sessionId?: string,
  timeoutMs?: number,
): Promise<string> {
  return getGroqResponse(messages, env, {
    timingLabel: 'buyer_gemma_formulation',
    sessionId,
    responseFormat: GEMMA_FORMULATION_RESPONSE_FORMAT,
    timeoutMs,
  });
}

export async function extractFormulationReply(params: {
  env: Env;
  userText: string;
  turn: TurnFacts;
  sessionId?: string;
  violationCodes?: string[];
  deadlineMs: number;
}): Promise<ParsedFormulation | null> {
  const remaining = params.deadlineMs - Date.now();
  if (remaining <= 0) return null;

  const messages: GroqMessage[] = [{role: 'system', content: FORMULATION_SYSTEM}];
  const userBody = buildUserPayload(params.userText, params.turn);
  if (params.violationCodes?.length) {
    messages.push({
      role: 'user',
      content:
        userBody +
        '\n\nPopraw odpowiedź. Naruszenia: ' +
        params.violationCodes.join(', '),
    });
  } else {
    messages.push({role: 'user', content: userBody});
  }

  const callTimeoutMs = Math.min(remaining, GEMMA_FORMULATION_BUDGET_MS);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      callFormulationModel(params.env, messages, params.sessionId, callTimeoutMs),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new FormulationTimeoutError()), remaining);
      }),
    ]);
    const parsed = parseFormulationJson(raw);
    if (!parsed.ok) return null;
    return parsed.formulation;
  } catch (e) {
    logFormulationError(e);
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export type FormulationLogOutcome =
  | 'ok'
  | 'retry_ok'
  | 'fallback_validator'
  | 'fallback_error'
  | 'fallback_timeout';
