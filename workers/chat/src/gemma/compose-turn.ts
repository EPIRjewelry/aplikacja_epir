import type {Env} from '../config/bindings';
import type {BuyerChannelId} from '../buyer/channel-switch';
import type {ComposeBuyerTurnOptions} from '../buyer/compose-buyer-turn';
import {BuyerTurnOverloadError} from '../buyer/buyer-llm-retry';
import {appendBuyerSessionMessage, readBuyerSessionHistory} from '../buyer/session-history';
import {detectJailbreakOrHarmIntent} from '../intent/jailbreak-prefilter';
import {extractGemmaIntent} from './intent/extract-intent';
import {coerceGemmaPolicyIntentFromHeuristic} from './intent/policy-intent-heuristic';
import {detectFormOfAddressFromText} from './profiles/epir';
import {runGemmaAllowedActions} from './actions/run';
import {buildEpirActionReply} from './actions/reply';
import {readGemmaState, writeGemmaState} from './session-gemma-state';
import {transitionGemmaState} from './state/machine';
import type {GemmaSessionState} from './state/types';
import {withBuyerTurnGate} from './turn-gate';
import {gemmaV2EmergencyReply} from './fallback';
import type {GemmaIntent} from './intent/schema';
import {buildEpirDeterministicReply} from './profiles/epir';
import {GemmaTurnError} from './errors';
import {maybeFormulateReply} from './formulation/run-formulation';
import {shouldInvokeFormulationB} from './formulation/build-turn-facts';
import type {GemmaSlots} from './state/types';

function presentSlotKeys(slots: GemmaSlots): string[] {
  const keys: (keyof GemmaSlots)[] = [
    'budget',
    'metal',
    'stone',
    'product_type',
    'occasion',
    'recipient',
  ];
  return keys.filter((k) => {
    const v = slots[k];
    return v !== null && v !== undefined && String(v).trim() !== '';
  });
}

function cartNeedsConsent(intent: GemmaIntent): boolean {
  if (!intent.cart_action || intent.cart_action === 'show') return false;
  return intent.cart_consent !== true;
}

function applyFormOfAddress(prev: GemmaSessionState, userText: string): GemmaSessionState {
  const detected = detectFormOfAddressFromText(userText);
  if (detected === 'unknown') return prev;
  return {...prev, form_of_address: detected};
}

async function runInsideGate(
  env: Env,
  channelId: BuyerChannelId,
  userText: string,
  opts: ComposeBuyerTurnOptions | undefined,
  clientRequest?: Request,
): Promise<string> {
  const wallStart = Date.now();
  const sessionId = opts?.sessionId?.trim() ?? '';

  if (detectJailbreakOrHarmIntent(userText).match) {
    const prev = await readGemmaState(env, sessionId);
    const next: GemmaSessionState = {
      ...prev,
      state: 'odmowa',
      turn: prev.turn + 1,
    };
    const reply = buildEpirDeterministicReply({
      channelId,
      state: 'odmowa',
    });
    if (sessionId) {
      try {
        await appendBuyerSessionMessage(env, sessionId, 'user', userText);
        await appendBuyerSessionMessage(env, sessionId, 'assistant', reply);
        await writeGemmaState(env, sessionId, next);
      } catch (e) {
        console.warn('[gemma.compose_turn] session persist failed', e);
      }
    }
    return reply;
  }

  const history = sessionId ? await readBuyerSessionHistory(env, sessionId) : [];
  const intentResult = await extractGemmaIntent({
    env,
    userText,
    history,
    sessionId,
  });

  if (!intentResult.ok) {
    const emergency = gemmaV2EmergencyReply(channelId);
    if (sessionId) {
      try {
        await appendBuyerSessionMessage(env, sessionId, 'user', userText);
        await appendBuyerSessionMessage(env, sessionId, 'assistant', emergency);
      } catch (e) {
        console.warn('[gemma.compose_turn] session persist failed', e);
      }
    }
    return emergency;
  }

  let prev = await readGemmaState(env, sessionId);
  prev = applyFormOfAddress(prev, userText);

  const intent = coerceGemmaPolicyIntentFromHeuristic(intentResult.intent, userText);
  const transitioned = transitionGemmaState(prev, intent);
  const userCorpus = [
    userText,
    ...history.filter((h) => h.role === 'user').map((h) => h.content),
  ].join('\n');

  const actionOutcome = await runGemmaAllowedActions({
    env,
    channelId,
    request: clientRequest ?? new Request('https://gemma-v2/buyer-turn'),
    sessionId,
    userText,
    userCorpus,
    intent,
    prev,
    transitioned,
    productHandle: opts?.productHandle,
  });

  const formulationB = shouldInvokeFormulationB(transitioned.nextState, actionOutcome);
  const turnSeq = prev.turn + 1;
  console.log(
    JSON.stringify({
      tag: 'gemma.turn',
      turn_seq: turnSeq,
      state: transitioned.nextState,
      slot_keys: presentSlotKeys(transitioned.slots),
      search_catalog: transitioned.allowedActions.includes('search_catalog'),
      catalog_n: actionOutcome.catalogCards.length,
      catalog_failed: actionOutcome.catalogFailed,
      formulation_b: formulationB,
    }),
  );

  const next: GemmaSessionState = {
    ...prev,
    state: transitioned.nextState,
    slots: transitioned.slots,
    shown: actionOutcome.shown,
    selected: actionOutcome.selected,
    turn: prev.turn + 1,
  };

  const deterministic = buildEpirActionReply({
    channelId,
    state: transitioned.nextState,
    missingSlot: transitioned.missingSlot,
    cartNeedsConsent: cartNeedsConsent(intent),
    intent,
    outcome: actionOutcome,
  });

  const reply = await maybeFormulateReply({
    env,
    channelId,
    userText,
    sessionId,
    state: transitioned.nextState,
    missingSlot: transitioned.missingSlot,
    outcome: actionOutcome,
    deterministicReply: deterministic,
    slots: transitioned.slots,
    userCorpus,
  });

  if (sessionId) {
    try {
      await appendBuyerSessionMessage(env, sessionId, 'user', userText);
      await appendBuyerSessionMessage(env, sessionId, 'assistant', reply);
      await writeGemmaState(env, sessionId, next);
    } catch (e) {
      console.warn('[gemma.compose_turn] session persist failed', e);
    }
  }

  console.log(
    JSON.stringify({
      tag: 'gemma.turn_done',
      turn_seq: turnSeq,
      wall_ms: Date.now() - wallStart,
    }),
  );

  return reply;
}

function wrapTurnError(e: unknown): never {
  if (e instanceof BuyerTurnOverloadError) throw e;
  if (e instanceof GemmaTurnError) throw e;
  throw new GemmaTurnError('unexpected', e);
}

export async function runGemmaV2Turn(
  env: Env,
  channelId: BuyerChannelId,
  userText: string,
  opts: ComposeBuyerTurnOptions | undefined,
  clientRequest?: Request,
): Promise<{reply: string}> {
  const sessionId = opts?.sessionId?.trim() ?? '';
  const turnId = crypto.randomUUID();

  const execute = async (): Promise<string> => {
    try {
      return await runInsideGate(env, channelId, userText, opts, clientRequest);
    } catch (e) {
      wrapTurnError(e);
    }
  };

  if (!sessionId) {
    return {reply: await execute()};
  }

  try {
    return {reply: await withBuyerTurnGate(env, sessionId, turnId, execute)};
  } catch (e) {
    wrapTurnError(e);
  }
}
