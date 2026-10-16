import {beforeEach, describe, expect, it, vi} from 'vitest';
import {handleBuyerTurn, BUYER_UNAVAILABLE_JSON} from '../../src/buyer/handle-buyer-turn';
import * as compose from '../../src/buyer/compose-buyer-turn';
import {geBuyerBody} from './fixtures/boundary-payloads';
import {makeGemmaRuntimeKv} from './fixtures/fake-testers-kv';
import {geBuyerBrandLock, gzBuyerBrandLock} from './helpers/brand-lock-fixtures';

const FIKCYJNY_TESTER_ID = '9001002001';

function postReq(body: Record<string, unknown>) {
  return new Request('https://example.com/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

describe('E1 internal tester gate (GE only)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('internal + ingress: tester on allowlist → compose', async () => {
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('ok');
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
        channelMode: 'internal',
        testers: [FIKCYJNY_TESTER_ID],
      }),
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body, {
      appProxyVerified: true,
      loggedInCustomerId: FIKCYJNY_TESTER_ID,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as {type: string}).type).toBe('message');
  });

  it('internal + ingress: not on allowlist → unavailable, no compose', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
        channelMode: 'internal',
        testers: [FIKCYJNY_TESTER_ID],
      }),
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body, {
      appProxyVerified: true,
      loggedInCustomerId: '9999999999',
    });
    expect(await res.json()).toEqual(BUYER_UNAVAILABLE_JSON);
    expect(composeSpy).not.toHaveBeenCalled();
  });

  it('internal + ingress: customer_id_hint ignored without logged_in_customer_id', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
        channelMode: 'internal',
        testers: [FIKCYJNY_TESTER_ID],
      }),
    } as never;
    const body = geBuyerBody({customer_id_hint: FIKCYJNY_TESTER_ID});
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body, {
      appProxyVerified: true,
      loggedInCustomerId: null,
    });
    expect(await res.json()).toEqual(BUYER_UNAVAILABLE_JSON);
    expect(composeSpy).not.toHaveBeenCalled();
  });

  it('internal + ingress: GZ channel blocked for all (E1b)', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
        channelMode: 'internal',
        channelId: 'epir-zareczyny',
        testers: [FIKCYJNY_TESTER_ID],
      }),
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, gzBuyerBrandLock(), body, {
      appProxyVerified: true,
      loggedInCustomerId: FIKCYJNY_TESTER_ID,
    });
    expect(await res.json()).toEqual(BUYER_UNAVAILABLE_JSON);
    expect(composeSpy).not.toHaveBeenCalled();
  });

  it('on mode: non-tester still reaches compose', async () => {
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('public on');
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({channelMode: 'on', testers: []}),
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body, {
      appProxyVerified: false,
      loggedInCustomerId: null,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as {reply: string}).reply).toBe('public on');
  });
});
