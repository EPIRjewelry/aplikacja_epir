import type {Env} from '../config/bindings';
import type {BuyerChannelId} from '../buyer/channel-switch';
import type {ComposeBuyerTurnOptions} from '../buyer/compose-buyer-turn';
import {appendBuyerSessionMessage} from '../buyer/session-history';
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
  const reply = gemmaV2EmergencyReply(channelId);
  const sessionId = opts?.sessionId?.trim();
  if (sessionId) {
    try {
      await appendBuyerSessionMessage(env, sessionId, 'user', userText);
      await appendBuyerSessionMessage(env, sessionId, 'assistant', reply);
    } catch (e) {
      console.warn('[gemma.compose_reply] session history append failed', e);
    }
  }
  return reply;
}
