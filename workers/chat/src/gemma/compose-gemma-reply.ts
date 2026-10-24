import type {Env} from '../config/bindings';
import type {BuyerChannelId} from '../buyer/channel-switch';
import type {ComposeBuyerTurnOptions} from '../buyer/compose-buyer-turn';
import {ensureBuyerSessionContext} from '../buyer/session-context';
import {runGemmaV2Turn} from './compose-turn';
import {BuyerTurnOverloadError} from '../buyer/buyer-llm-retry';
import {GemmaTurnError} from './errors';
import {gemmaV2EmergencyReply} from './fallback';

export async function composeGemmaReply(
  env: Env,
  channelId: BuyerChannelId,
  userText: string,
  _request: Request,
  opts?: ComposeBuyerTurnOptions,
): Promise<string> {
  await ensureBuyerSessionContext(env, {
    sessionId: opts?.sessionId,
    channelId,
    storefrontId: opts?.storefrontId,
    bodyChannel: opts?.bodyChannel,
    userText,
    analyticsConsent: opts?.analyticsConsent,
    preferencesConsent: opts?.preferencesConsent,
    sessionIdSource: opts?.sessionIdSource,
  });
  try {
    const {reply} = await runGemmaV2Turn(env, channelId, userText, opts, _request);
    return reply;
  } catch (e) {
    if (e instanceof BuyerTurnOverloadError) throw e;
    if (e instanceof GemmaTurnError) {
      console.log(JSON.stringify({tag: 'gemma.turn_error', kind: e.kind}));
      return gemmaV2EmergencyReply(channelId);
    }
    throw e;
  }
}
