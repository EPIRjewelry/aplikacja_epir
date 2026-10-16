import {beforeEach, describe, expect, it, vi} from 'vitest';
import worker from '../../src/index';
import * as compose from '../../src/buyer/compose-buyer-turn';
import {greetingForBrandLock, type ChatBrandLock} from '../../src/brand-lock';
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

  it('operator S2S /chat: composeBuyerAssistantReply never called; operator greeting in reply', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const {env} = makeWorkerTestEnv();

    const response = await worker.fetch(makeOperatorChatRequest(), env, noopCtx);

    expect(composeSpy).toHaveBeenCalledTimes(0);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {reply?: string; session_id?: string};
    expect(payload.reply).toBe(greetingForBrandLock(operatorBrandLock));
    expect(payload.session_id).toBeTruthy();
  });
});
