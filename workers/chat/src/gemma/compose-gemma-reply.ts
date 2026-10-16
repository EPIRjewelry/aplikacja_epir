import type {Env} from '../config/bindings';
import type {BuyerChannelId} from '../buyer/channel-switch';
import type {ComposeBuyerTurnOptions} from '../buyer/compose-buyer-turn';
import {ensureBuyerSessionContext} from '../buyer/session-context';
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
    sessionIdSource: opts?.sessionIdSource,
  });
  return gemmaV2EmergencyReply(channelId);
}
