import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  handleBuyerTurn,
  BUYER_UNAVAILABLE_JSON,
} from '../../src/buyer/handle-buyer-turn';
import * as channelSwitch from '../../src/buyer/channel-switch';
import * as compose from '../../src/buyer/compose-buyer-turn';
import {FINAL_TOOL_FALLBACK_USER} from '../../src/buyer/compose-buyer-turn';
import {BuyerTurnOverloadError, BUYER_LLM_OVERLOAD_MESSAGE} from '../../src/buyer/buyer-llm-retry';
import {geBuyerBody, gzBuyerBody, FIKCYJNY_SESSION_ID} from './fixtures/boundary-payloads';
import {makeGemmaChannelKv} from './fixtures/fake-gemma-kv';
import {geBuyerBrandLock, gzBuyerBrandLock} from './helpers/brand-lock-fixtures';
import {
  expectAssistantFailed,
  expectBuyerMessageShape,
  expectBuyerUnavailable,
  expectMissingUserMessage,
} from './helpers/http-assertions';

function postReq(body: Record<string, unknown>) {
  return new Request('https://example.com/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

describe('E0 boundary — HTTP response shape (handleBuyerTurn)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('off → 200 unavailable channel_off without compose', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaChannelKv({'epir-online-store': 'off'}),
    } as never;

    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expectBuyerUnavailable(json);
    expect(composeSpy).not.toHaveBeenCalled();
  });

  it('unknown KV value maybe → off via readChannelMode → unavailable (fail-closed)', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaChannelKv({'epir-online-store': 'maybe'}),
    } as never;

    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(BUYER_UNAVAILABLE_JSON);
    expect(composeSpy).not.toHaveBeenCalled();
  });

  it('no GEMMA_RUNTIME_KV binding → fail-closed unavailable', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(BUYER_UNAVAILABLE_JSON);
    expect(composeSpy).not.toHaveBeenCalled();
  });

  it('missing user message → 400 missing_user_message', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const body = {message: '   ', session_id: FIKCYJNY_SESSION_ID};

    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    const json = (await res.json()) as Record<string, unknown>;

    expectMissingUserMessage(json, res.status);
    expect(composeSpy).not.toHaveBeenCalled();
  });

  it('GZ on → 200 message epir-zareczyny / hydrogen-zareczyny context', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('Odpowiedź GZ fikcyjna.');

    const body = gzBuyerBody();
    const res = await handleBuyerTurn(postReq(body), {} as never, gzBuyerBrandLock(), body);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expectBuyerMessageShape(json, {mode: 'on', channelId: 'epir-zareczyny'});
    expect(json.reply).toBe('Odpowiedź GZ fikcyjna.');
  });

  it('on → 200 message with channel_id, mode, session_id, reply', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('Odpowiedź fikcyjna E0.');

    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expectBuyerMessageShape(json, {mode: 'on', channelId: 'epir-online-store'});
    expect(json.session_id).toBe(FIKCYJNY_SESSION_ID);
    expect(json.reply).toBe('Odpowiedź fikcyjna E0.');
  });

  it('internal without verified ingress → unavailable (E1 tester gate fail-closed)', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('internal');
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');

    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);

    expect(res.status).toBe(200);
    expectBuyerUnavailable(await res.json());
    expect(composeSpy).not.toHaveBeenCalled();
  });

  it('BuyerTurnOverloadError → 200 message with overload copy', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockRejectedValue(new BuyerTurnOverloadError());

    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.type).toBe('message');
    expect(json.reply).toBe(BUYER_LLM_OVERLOAD_MESSAGE);
    expect(json.mode).toBe('on');
    expect(json.channel_id).toBe('epir-online-store');
    expect(json.session_id).toBe(FIKCYJNY_SESSION_ID);
  });

  it('empty AI Gateway content → 200 FINAL_TOOL_FALLBACK_USER', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockRejectedValue(
      new Error('AI Gateway returned empty content'),
    );

    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.type).toBe('message');
    expect(json.reply).toBe(FINAL_TOOL_FALLBACK_USER);
    expect(json.channel_id).toBe('epir-online-store');
    expect(json.mode).toBe('on');
  });

  it('generic compose failure → 500 assistant_failed', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockRejectedValue(new Error('fikcyjny błąd modelu'));

    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), {} as never, geBuyerBrandLock(), body);
    const json = (await res.json()) as Record<string, unknown>;

    expectAssistantFailed(json, res.status);
  });
});
