import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  handleBuyerTurn,
  BUYER_UNAVAILABLE_JSON,
} from '../../src/buyer/handle-buyer-turn';
import * as compose from '../../src/buyer/compose-buyer-turn';
import * as gemmaCompose from '../../src/gemma/compose-gemma-reply';
import {BuyerTurnOverloadError, BUYER_LLM_OVERLOAD_MESSAGE} from '../../src/buyer/buyer-llm-retry';
import {FINAL_TOOL_FALLBACK_USER} from '../../src/buyer/compose-buyer-turn';
import {channelKvKey, coreKvKey} from '../../src/buyer/channel-switch';
import {
  geBuyerBody,
  FIKCYJNY_SESSION_ID,
  FIKCYJNY_USER_MESSAGE,
} from './fixtures/boundary-payloads';
import {makeGemmaRuntimeKv} from './fixtures/fake-testers-kv';
import {geBuyerBrandLock} from './helpers/brand-lock-fixtures';

function postReq(body: Record<string, unknown>) {
  return new Request('https://example.com/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

const LEGACY_COMPOSE_OPTS = {
  sessionId: FIKCYJNY_SESSION_ID,
  productHandle: undefined,
  storefrontId: 'online-store',
  bodyChannel: 'online-store',
  analyticsConsent: undefined,
  preferencesConsent: 0,
  sessionIdSource: undefined,
};

describe('E1 legacy parity (real readGemmaCoreMode)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('on + legacy core: full JSON and exact composeBuyerAssistantReply args', async () => {
    const legacySpy = vi
      .spyOn(compose, 'composeBuyerAssistantReply')
      .mockResolvedValue('parity reply');
    const gemmaSpy = vi.spyOn(gemmaCompose, 'composeGemmaReply');
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({channelMode: 'on', coreMode: 'legacy'}),
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      type: 'message',
      reply: 'parity reply',
      channel_id: 'epir-online-store',
      mode: 'on',
      session_id: FIKCYJNY_SESSION_ID,
    });
    expect(legacySpy).toHaveBeenCalledTimes(1);
    expect(legacySpy).toHaveBeenCalledWith(
      env,
      'epir-online-store',
      FIKCYJNY_USER_MESSAGE,
      expect.any(Request),
      LEGACY_COMPOSE_OPTS,
    );
    expect(gemmaSpy).not.toHaveBeenCalled();
  });

  it('bogus core KV value → legacy compose (fail-safe)', async () => {
    const legacySpy = vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('bogus-core');
    const gemmaSpy = vi.spyOn(gemmaCompose, 'composeGemmaReply');
    const env = {
      GEMMA_RUNTIME_KV: {
        async get(key: string) {
          if (key === channelKvKey('epir-online-store')) return 'on';
          if (key === coreKvKey('epir-online-store')) return 'bogus';
          return null;
        },
      },
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);
    expect(await res.json()).toEqual({
      type: 'message',
      reply: 'bogus-core',
      channel_id: 'epir-online-store',
      mode: 'on',
      session_id: FIKCYJNY_SESSION_ID,
    });
    expect(legacySpy).toHaveBeenCalledTimes(1);
    expect(gemmaSpy).not.toHaveBeenCalled();
  });

  it('missing GEMMA_RUNTIME_KV binding → unavailable (channel fail-closed off)', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    expect(await res.json()).toEqual(BUYER_UNAVAILABLE_JSON);
    expect(composeSpy).not.toHaveBeenCalled();
  });

  it('channel KV read error → unavailable', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const env = {
      GEMMA_RUNTIME_KV: {
        async get(key: string) {
          if (key === channelKvKey('epir-online-store')) throw new Error('kv down');
          return null;
        },
      },
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);
    expect(await res.json()).toEqual(BUYER_UNAVAILABLE_JSON);
    expect(composeSpy).not.toHaveBeenCalled();
  });

  it('core KV read error → legacy compose when channel on', async () => {
    const legacySpy = vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('core-kv-error');
    const env = {
      GEMMA_RUNTIME_KV: {
        async get(key: string) {
          if (key === channelKvKey('epir-online-store')) return 'on';
          if (key === coreKvKey('epir-online-store')) throw new Error('core kv down');
          return null;
        },
      },
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);
    expect(await res.json()).toEqual({
      type: 'message',
      reply: 'core-kv-error',
      channel_id: 'epir-online-store',
      mode: 'on',
      session_id: FIKCYJNY_SESSION_ID,
    });
    expect(legacySpy).toHaveBeenCalledTimes(1);
  });

  it('overload path unchanged under legacy core routing', async () => {
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockRejectedValue(new BuyerTurnOverloadError());
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({channelMode: 'on', coreMode: 'legacy'}),
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);
    const json = (await res.json()) as {reply?: string};
    expect(json.reply).toBe(BUYER_LLM_OVERLOAD_MESSAGE);
  });

  it('empty AIG path unchanged under legacy core routing', async () => {
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockRejectedValue(
      new Error('AI Gateway returned empty content'),
    );
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({channelMode: 'on', coreMode: 'legacy'}),
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);
    const json = (await res.json()) as {reply?: string};
    expect(json.reply).toBe(FINAL_TOOL_FALLBACK_USER);
  });

  it('T-E3-LEGACY-1: legacy core does not call composeGemmaReply or gemma-state', async () => {
    const legacySpy = vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('legacy-only');
    const gemmaSpy = vi.spyOn(gemmaCompose, 'composeGemmaReply');
    const {namespace, calls} = await import('./helpers/session-do-calls').then((m) =>
      m.makeTrackedSessionNamespace(),
    );
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({channelMode: 'on', coreMode: 'legacy'}),
      SESSION_DO: namespace,
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);
    expect(res.status).toBe(200);
    expect(gemmaSpy).not.toHaveBeenCalled();
    expect(legacySpy).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.path === 'gemma-state')).toBe(false);
  });

  it('off still unavailable without compose', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({channelMode: 'off', coreMode: 'legacy'}),
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);
    expect(await res.json()).toEqual(BUYER_UNAVAILABLE_JSON);
    expect(composeSpy).not.toHaveBeenCalled();
  });
});
