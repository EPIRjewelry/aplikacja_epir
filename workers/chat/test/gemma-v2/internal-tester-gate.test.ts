import {beforeEach, describe, expect, it, vi} from 'vitest';
import {handleBuyerTurn, BUYER_UNAVAILABLE_JSON} from '../../src/buyer/handle-buyer-turn';
import * as compose from '../../src/buyer/compose-buyer-turn';
import {geBuyerBody} from './fixtures/boundary-payloads';
import {
  FIKCYJNY_TESTER_ID,
  makeGemmaRuntimeKv,
} from './fixtures/fake-testers-kv';
import {
  geBuyerBrandLock,
  gzBuyerBrandLock,
  kazkaBuyerBrandLock,
} from './helpers/brand-lock-fixtures';

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

  it('internal + ingress: appProxyVerified false blocks even allowlisted tester (M2)', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
        channelMode: 'internal',
        testers: [FIKCYJNY_TESTER_ID],
      }),
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body, {
      appProxyVerified: false,
      loggedInCustomerId: FIKCYJNY_TESTER_ID,
    });
    expect(await res.json()).toEqual(BUYER_UNAVAILABLE_JSON);
    expect(composeSpy).not.toHaveBeenCalled();
  });

  it('internal without ingress argument → unavailable (fail-closed)', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
        channelMode: 'internal',
        testers: [FIKCYJNY_TESTER_ID],
      }),
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);
    expect(await res.json()).toEqual(BUYER_UNAVAILABLE_JSON);
    expect(composeSpy).not.toHaveBeenCalled();
  });

  it('internal + ingress: GZ allowlisted tester via S2S ingress (E1b) → compose', async () => {
    vi.spyOn(compose, 'composeBuyerAssistantReply').mockResolvedValue('gz-internal');
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
        channelMode: 'internal',
        channelId: 'epir-zareczyny',
        testers: [FIKCYJNY_TESTER_ID],
      }),
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, gzBuyerBrandLock(), body, {
      appProxyVerified: false,
      loggedInCustomerId: FIKCYJNY_TESTER_ID,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as {type: string}).type).toBe('message');
  });

  it('internal + ingress: KAZKA channel blocked for all (M13)', async () => {
    const composeSpy = vi.spyOn(compose, 'composeBuyerAssistantReply');
    const env = {
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
        channelMode: 'internal',
        channelId: 'kazka-hydrogen',
        testers: [FIKCYJNY_TESTER_ID],
      }),
    } as never;
    const body = geBuyerBody();
    const res = await handleBuyerTurn(postReq(body), env, kazkaBuyerBrandLock(), body, {
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
