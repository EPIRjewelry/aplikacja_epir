import {beforeEach, describe, expect, it, vi} from 'vitest';
import {handleBuyerTurn, BUYER_UNAVAILABLE_JSON} from '../../src/buyer/handle-buyer-turn';
import * as channelSwitch from '../../src/buyer/channel-switch';
import * as compose from '../../src/buyer/compose-buyer-turn';
import * as gemmaCompose from '../../src/gemma/compose-gemma-reply';
import {BuyerTurnOverloadError, BUYER_LLM_OVERLOAD_MESSAGE} from '../../src/buyer/buyer-llm-retry';
import {FINAL_TOOL_FALLBACK_USER} from '../../src/buyer/compose-buyer-turn';
import {geBuyerBody, FIKCYJNY_SESSION_ID} from './fixtures/boundary-payloads';
import {geBuyerBrandLock} from './helpers/brand-lock-fixtures';

function postReq(body: Record<string, unknown>) {
  return new Request('https://example.com/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

async function runLegacyPath(coreMode: 'legacy' | 'kv-missing') {
  vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
  vi.spyOn(channelSwitch, 'readGemmaCoreMode').mockResolvedValue(
    coreMode === 'legacy' ? 'legacy' : 'legacy',
  );
  if (coreMode === 'kv-missing') {
    vi.spyOn(channelSwitch, 'readGemmaCoreMode').mockResolvedValue('legacy');
  }
  const legacySpy = vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('parity reply');
  const gemmaSpy = vi.spyOn(gemmaCompose, 'composeGemmaReply');

  const body = geBuyerBody();
  const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
  const json = await res.json();
  return {res, json, legacySpy, gemmaSpy};
}

describe('E1 legacy parity (core=legacy)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('on + legacy core matches prior success shape and legacy compose only', async () => {
    const {res, json, legacySpy, gemmaSpy} = await runLegacyPath('legacy');
    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      type: 'message',
      reply: 'parity reply',
      channel_id: 'epir-online-store',
      mode: 'on',
      session_id: FIKCYJNY_SESSION_ID,
    });
    expect(legacySpy).toHaveBeenCalledTimes(1);
    expect(gemmaSpy).not.toHaveBeenCalled();
  });

  it('overload path unchanged under legacy core', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(channelSwitch, 'readGemmaCoreMode').mockResolvedValue('legacy');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockRejectedValue(new BuyerTurnOverloadError());

    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    const json = (await res.json()) as {reply?: string};
    expect(json.reply).toBe(BUYER_LLM_OVERLOAD_MESSAGE);
  });

  it('empty AIG path unchanged under legacy core', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(channelSwitch, 'readGemmaCoreMode').mockResolvedValue('legacy');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockRejectedValue(
      new Error('AI Gateway returned empty content'),
    );

    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    const json = (await res.json()) as {reply?: string};
    expect(json.reply).toBe(FINAL_TOOL_FALLBACK_USER);
  });

  it('off still unavailable without compose when core legacy', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('off');
    vi.spyOn(channelSwitch, 'readGemmaCoreMode').mockResolvedValue('legacy');
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');

    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    expect(await res.json()).toEqual(BUYER_UNAVAILABLE_JSON);
    expect(composeSpy).not.toHaveBeenCalled();
  });
});
