import {beforeEach, describe, expect, it, vi} from 'vitest';
import {handleBuyerTurn} from '../../src/buyer/handle-buyer-turn';
import type {Env} from '../../src/config/bindings';
import {geBuyerBody} from './fixtures/boundary-payloads';
import {makeGemmaChannelKv} from './fixtures/fake-gemma-kv';
import {geBuyerBrandLock} from './helpers/brand-lock-fixtures';
import {callOrderIndexes, makeTrackedSessionNamespace} from './helpers/session-do-calls';
import {stubBuyerComposeDeps} from './helpers/stub-compose-deps';

function postReq(body: Record<string, unknown>) {
  return new Request('https://example.com/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

function buyerEnvWithSession(namespace: DurableObjectNamespace): Env {
  return {
    SESSION_DO: namespace,
    GEMMA_RUNTIME_KV: makeGemmaChannelKv({'epir-online-store': 'on'}),
    ALLOWED_ORIGIN: '*',
    SHOP_DOMAIN: 'test-shop.myshopify.com',
  } as Env;
}

describe('E0 boundary — SessionDO call order in buyer turn', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('real composeBuyerAssistantReply: set-session-id → set-storefront-context before append user/assistant', async () => {
    await stubBuyerComposeDeps('Odpowiedź z prawdziwego compose.');
    const {namespace, calls} = makeTrackedSessionNamespace();
    const env = buyerEnvWithSession(namespace);

    const body = geBuyerBody({message: 'Fikcyjne zapytanie o pierścionek'});
    const res = await handleBuyerTurn(postReq(body), env, geBuyerBrandLock(), body);
    expect(res.status).toBe(200);

    const setSid = callOrderIndexes(calls, 'set-session-id');
    const setSf = callOrderIndexes(calls, 'set-storefront-context');
    const appends = callOrderIndexes(calls, 'append');
    expect(setSid.length).toBeGreaterThan(0);
    expect(setSf.length).toBeGreaterThan(0);
    expect(appends.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...setSid)).toBeLessThan(Math.min(...setSf));
    expect(Math.min(...setSf)).toBeLessThan(Math.min(...appends));

    const appendRoles = calls
      .filter((c) => c.path === 'append')
      .map((c) => (c.body as {role?: string}).role);
    expect(appendRoles).toEqual(['user', 'assistant']);
  });

  it('second turn reuses same Session DO id (real compose)', async () => {
    await stubBuyerComposeDeps('ok');
    const {namespace, calls} = makeTrackedSessionNamespace();
    const env = buyerEnvWithSession(namespace);

    const body1 = geBuyerBody({message: 'Tura jeden'});
    const res1 = await handleBuyerTurn(postReq(body1), env, geBuyerBrandLock(), body1);
    const json1 = (await res1.json()) as {session_id?: string};
    const sid = json1.session_id!;
    const before = calls.length;

    const body2 = geBuyerBody({message: 'Tura dwa', session_id: sid});
    await handleBuyerTurn(postReq(body2), env, geBuyerBrandLock(), body2);

    const turn2 = calls.slice(before);
    expect(turn2.every((c) => c.doId === sid)).toBe(true);
    expect(turn2.some((c) => c.path === 'set-session-id')).toBe(true);
  });
});
