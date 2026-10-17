import type {Env} from '../../config/bindings';
import {GEMMA_FORMULATION_BUDGET_MS} from './constants';
import {
  allowedUrlSet,
  buildTurnFacts,
  shouldInvokeFormulationB,
  validationFactsFromTurn,
} from './build-turn-facts';
import {extractFormulationReply, type FormulationLogOutcome} from './extract-formulation';
import {stitchFormulationReply} from './stitch-reply';
import type {GemmaActionOutcome} from '../actions/types';
import type {GemmaConversationState, GemmaSlots} from '../state/types';
import type {BuyerChannelId} from '../../buyer/channel-switch';
import {hasInternalRefMarkerLeak} from './buyer-reply-format';
import {
  assertStitchedUrlsAllowed,
  validateFormulationTextBeforeStitch,
} from '../validation/reply-validator';

export async function maybeFormulateReply(params: {
  env: Env;
  channelId: BuyerChannelId;
  userText: string;
  sessionId?: string;
  state: GemmaConversationState;
  missingSlot?: keyof GemmaSlots;
  outcome: GemmaActionOutcome;
  deterministicReply: string;
}): Promise<string> {
  if (!shouldInvokeFormulationB(params.state, params.outcome)) {
    return params.deterministicReply;
  }

  const turn = buildTurnFacts({
    channelId: params.channelId,
    state: params.state,
    missingSlot: params.missingSlot,
    userText: params.userText,
    outcome: params.outcome,
  });

  const deadlineMs = Date.now() + GEMMA_FORMULATION_BUDGET_MS;
  const start = Date.now();
  let outcome: FormulationLogOutcome = 'fallback_error';

  const first = await extractFormulationReply({
    env: params.env,
    userText: params.userText,
    turn,
    sessionId: params.sessionId,
    deadlineMs,
  });

  const tryAccept = (parsed: import('./types').ParsedFormulation | null): string | null => {
    if (!parsed) return null;
    const vfacts = validationFactsFromTurn(turn, params.userText);
    const violations = validateFormulationTextBeforeStitch(
      parsed.text,
      parsed.product_refs,
      vfacts,
    );
    if (violations.length) return null;
    const stitched = stitchFormulationReply(turn, parsed);
    if (hasInternalRefMarkerLeak(stitched)) return null;
    if (!assertStitchedUrlsAllowed(stitched, allowedUrlSet(turn))) return null;
    return stitched;
  };

  let accepted = tryAccept(first);
  if (accepted) {
    outcome = 'ok';
    console.log(
      JSON.stringify({
        tag: 'gemma.formulation',
        outcome,
        ms: Date.now() - start,
      }),
    );
    return accepted;
  }

  const violations = first
    ? validateFormulationTextBeforeStitch(
        first.text,
        first.product_refs,
        validationFactsFromTurn(turn, params.userText),
      )
    : ['parse_or_transport'];

  // E5-D2: błąd B (transport, zły JSON, timeout) → od razu deterministycznie; retry tylko po naruszeniu walidatora.
  if (first && Date.now() < deadlineMs) {
    const second = await extractFormulationReply({
      env: params.env,
      userText: params.userText,
      turn,
      sessionId: params.sessionId,
      violationCodes: violations,
      deadlineMs,
    });
    accepted = tryAccept(second);
    if (accepted) {
      outcome = 'retry_ok';
      console.log(
        JSON.stringify({
          tag: 'gemma.formulation',
          outcome,
          ms: Date.now() - start,
        }),
      );
      return accepted;
    }
  }

  outcome = first ? 'fallback_validator' : violations.includes('parse_or_transport')
    ? Date.now() >= deadlineMs
      ? 'fallback_timeout'
      : 'fallback_error'
    : 'fallback_validator';

  console.log(
    JSON.stringify({
      tag: 'gemma.formulation',
      outcome,
      ms: Date.now() - start,
    }),
  );
  return params.deterministicReply;
}
