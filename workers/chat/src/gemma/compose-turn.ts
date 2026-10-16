import type {Env} from '../config/bindings';
import type {BuyerChannelId} from '../buyer/channel-switch';
import type {ComposeBuyerTurnOptions} from '../buyer/compose-buyer-turn';
import {appendBuyerSessionMessage, readBuyerSessionHistory} from '../buyer/session-history';
import {detectJailbreakOrHarmIntent} from '../intent/jailbreak-prefilter';
import {extractGemmaIntent} from './intent/extract-intent';
import {buildEpirDeterministicReply, detectFormOfAddressFromText} from './profiles/epir';
import {readGemmaState, writeGemmaState} from './session-gemma-state';
import {transitionGemmaState} from './state/machine';
import type {GemmaSessionState} from './state/types';
import {withBuyerTurnGate} from './turn-gate';
import {gemmaV2EmergencyReply} from './fallback';
import type {GemmaIntent} from './intent/schema';

export type ComposeTurnTrace = {
  usedEmergency: boolean;
  nextState: string;
};

function cartNeedsConsent(intent: GemmaIntent): boolean {
  if (!intent.cart_action || intent.cart_action === 'show') return false;
  return intent.cart_consent !== true;
}

function applyFormOfAddress(prev: GemmaSessionState, userText: string): GemmaSessionState {
  const detected = detectFormOfAddressFromText(userText);
  if (detected === 'unknown') return prev;
  return {...prev, form_of_address: detected};
}

export async function runGemmaV2Turn(
  env: Env,
  channelId: BuyerChannelId,
  userText: string,
  opts: ComposeBuyerTurnOptions | undefined,
): Promise<{reply: string; trace: ComposeTurnTrace}> {
  const sessionId = opts?.sessionId?.trim() ?? '';
  const turnId = crypto.randomUUID();

  const runInsideGate = async (): Promise<string> => {
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

    const transitioned = transitionGemmaState(prev, intentResult.intent);
    const next: GemmaSessionState = {
      ...prev,
      state: transitioned.nextState,
      slots: transitioned.slots,
      turn: prev.turn + 1,
    };

    const reply = buildEpirDeterministicReply({
      channelId,
      state: transitioned.nextState,
      missingSlot: transitioned.missingSlot,
      cartNeedsConsent: cartNeedsConsent(intentResult.intent),
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
  };

  if (!sessionId) {
    const reply = await runInsideGate();
    return {reply, trace: {usedEmergency: reply === gemmaV2EmergencyReply(channelId), nextState: 'powitanie'}};
  }

  const reply = await withBuyerTurnGate(env, sessionId, turnId, runInsideGate);
  const saved = await readGemmaState(env, sessionId);
  return {
    reply,
    trace: {
      usedEmergency: reply === gemmaV2EmergencyReply(channelId),
      nextState: saved.state,
    },
  };
}
