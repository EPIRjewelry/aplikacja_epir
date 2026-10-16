import {beforeEach, describe, expect, it, vi} from 'vitest';
import worker from '../../src/index';
import * as compose from '../../src/buyer/compose-buyer-turn';
import * as buyerTurn from '../../src/buyer/handle-buyer-turn';
import * as gemmaCompose from '../../src/gemma/compose-gemma-reply';
import {greetingForBrandLock, type ChatBrandLock} from '../../src/brand-lock';
import {makeGemmaRuntimeKv} from './fixtures/fake-testers-kv';
import {makeWorkerTestEnv} from './helpers/worker-env';

const noopCtx = {waitUntil() {}} as unknown as ExecutionContext;

const operatorBrandLock: ChatBrandLock = {
  side: 'operator',
  brand: 'operator',
  storefrontId: 'operator',
  channel: 'operator',
  brandKey: 'operator',
  source: 'operator',
};

function makeOperatorChatRequest() {
  return new Request('https://asystent.epirbizuteria.pl/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-EPIR-SHARED-SECRET': 'shared-secret',
      'X-EPIR-STOREFRONT-ID': 'operator',
      'X-EPIR-CHANNEL': 'operator',
    },
    body: JSON.stringify({
      message: 'hej',
      stream: false,
      storefrontId: 'body-storefront',
      channel: 'body-channel',
      brand: 'epir',
    }),
  });
}

describe('E0 boundary — operator ingress isolation (W1 positive)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('operator S2S /chat: composeBuyerAssistantReply never called; isShortGreeting operator reply', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const {env} = makeWorkerTestEnv();

    const response = await worker.fetch(makeOperatorChatRequest(), env, noopCtx);

    expect(composeSpy).toHaveBeenCalledTimes(0);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {reply?: string; session_id?: string};
    expect(payload.reply).toBe(greetingForBrandLock(operatorBrandLock));
    expect(payload.session_id).toBeTruthy();
  });

  it('T-NEG-4: operator ingress with KV core=v2 mode=on — handleBuyerTurn and composeGemmaReply never called', async () => {
    const handleSpy = vi.spyOn(buyerTurn, 'handleBuyerTurn');
    const gemmaSpy = vi.spyOn(gemmaCompose, 'composeGemmaReply');
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const {env} = makeWorkerTestEnv({
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({channelMode: 'on', coreMode: 'v2'}),
    });

    const response = await worker.fetch(makeOperatorChatRequest(), env, noopCtx);

    expect(response.status).toBe(200);
    expect(handleSpy).toHaveBeenCalledTimes(0);
    expect(gemmaSpy).toHaveBeenCalledTimes(0);
    expect(composeSpy).toHaveBeenCalledTimes(0);
  });
});
