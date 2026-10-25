/**
 * E2 — legacy vs v2 buyer turn D1 parity (SessionDO write-through).
 *
 * Mutation regression (revert after RED):
 * - **M-E2-1** — Remove append block from `compose-gemma-reply.ts` → v2: brak INSERT messages.
 * - **M-E2-2** — Remove `ensureBuyerSessionContext` from v2 → `channel`/`storefront_id` null.
 * - **M-E2-3** — Append tylko `user`, bez `assistant` → T-PARITY-1 / T-PARITY-2 FAIL.
 * - **M-E2-4** — `appendBuyerSessionMessage` reject bez try/catch w v2 → T-PARITY-3 FAIL.
 * - **M-E5-20** — T-PARITY-3 (E5-D10) → reply_fail !== reply_ok.
 * - **M-E2-5** — Zła para channel/storefront (np. operator) → OPERATOR_STUDIO_CHANNELS / asercje GE/GZ FAIL.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {SessionDO} from '../../src/index';
import type {Env} from '../../src/config/bindings';
import {composeBuyerAssistantReply} from '../../src/buyer/compose-buyer-turn';
import {composeGemmaReply} from '../../src/gemma/compose-gemma-reply';
import {gemmaV2EmergencyReply} from '../../src/gemma/fallback';
import {handleBuyerTurn} from '../../src/buyer/handle-buyer-turn';
import * as sessionHistory from '../../src/buyer/session-history';
import {OPERATOR_STUDIO_CHANNELS} from '../../../bigquery-batch/src/gemma-channel-filter';
import {makeDurableStateStub} from '../helpers/session-do-sql-stub';
import {makeFakeD1Chatbot, type CapturedMessageInsert} from './fixtures/fake-d1-chatbot';
import {geBuyerBody} from './fixtures/boundary-payloads';
import {makeGemmaRuntimeKv} from './fixtures/fake-testers-kv';
import {geBuyerBrandLock} from './helpers/brand-lock-fixtures';
import {stubBuyerComposeDeps} from './helpers/stub-compose-deps';
import {stubGemmaIntentJson} from './helpers/stub-gemma-intent';
import {callOrderIndexes, makeTrackedSessionNamespace} from './helpers/session-do-calls';

function makeSessionDoEnv(d1: D1Database, sessionShardId: string) {
  const durableState = makeDurableStateStub(sessionShardId);
  const instance = new SessionDO(durableState.state, {DB_CHATBOT: d1} as Env);
  const stub = {
    fetch(input: RequestInfo | URL, init?: RequestInit) {
      const request =
        input instanceof Request
          ? input
          : new Request(new URL(String(input), 'https://session').toString(), init);
      return instance.fetch(request);
    },
  } as DurableObjectStub;
  const namespace = {
    idFromName(name: string) {
      return name;
    },
    get() {
      return stub;
    },
  } as unknown as DurableObjectNamespace;
  return {env: {SESSION_DO: namespace} as Env};
}

function normalizeInserts(rows: CapturedMessageInsert[]) {
  return rows.map((r) => ({
    role: r.role,
    content: r.content,
    storefront_id: r.storefront_id,
    channel: r.channel,
  }));
}

function postReq(body: Record<string, unknown>) {
  return new Request('https://example.com/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
}

describe('E2 buyer turn D1 parity — legacy vs v2', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-PARITY-1 GE: legacy compose vs v2 compose — same message rows (channel/storefront)', async () => {
    const userText = 'Fikcyjne zapytanie parity GE';
    await stubBuyerComposeDeps('Fikcyjna odpowiedz parity bez linkow');
    const req = new Request('https://example.com/chat', {method: 'POST'});

    const sidLegacy = 'sess_e2_parity_legacy_ge';
    const {db: dbL, messageInserts: legacyInserts} = makeFakeD1Chatbot();
    const {env: envLegacy} = makeSessionDoEnv(dbL, sidLegacy);
    const legacyReply = await composeBuyerAssistantReply(envLegacy, 'epir-online-store', userText, req, {
      sessionId: sidLegacy,
      storefrontId: 'online-store',
      bodyChannel: 'online-store',
    });

    const sidV2 = 'sess_e2_parity_v2_ge';
    const {db: dbV, messageInserts: v2Inserts} = makeFakeD1Chatbot();
    const {env: envV2} = makeSessionDoEnv(dbV, sidV2);
    await stubGemmaIntentJson({
      slots: {product_type: 'kolczyki', recipient: 'fikcyjny odbiorca'},
    });
    const v2Reply = await composeGemmaReply(envV2, 'epir-online-store', userText, req, {
      sessionId: sidV2,
      storefrontId: 'online-store',
      bodyChannel: 'online-store',
    });

    const strip = (rows: CapturedMessageInsert[]) =>
      normalizeInserts(rows).map((r) => (r.role === 'assistant' ? {...r, content: '<reply>'} : r));
    expect(strip(legacyInserts)).toEqual(strip(v2Inserts));
    expect(legacyInserts.find((r) => r.role === 'assistant')?.content).toBe(legacyReply);
    expect(v2Inserts.find((r) => r.role === 'assistant')?.content).toBe(v2Reply);
    expect(v2Inserts.map((r) => r.role)).toEqual(['user', 'assistant']);
    for (const row of v2Inserts) {
      expect(row.channel).toBe('online-store');
      expect(row.storefront_id).toBe('online-store');
      expect(OPERATOR_STUDIO_CHANNELS).not.toContain(row.channel);
    }
  });

  it('T-PARITY-1 GZ: legacy compose vs v2 compose — hydrogen-zareczyny / zareczyny', async () => {
    const userText = 'Fikcyjne zapytanie parity GZ';
    await stubBuyerComposeDeps('Fikcyjna odpowiedz parity bez linkow');
    const req = new Request('https://example.com/chat', {method: 'POST'});

    const sidLegacy = 'sess_e2_parity_legacy_gz';
    const {db: dbL, messageInserts: legacyInserts} = makeFakeD1Chatbot();
    const {env: envLegacy} = makeSessionDoEnv(dbL, sidLegacy);
    const legacyReply = await composeBuyerAssistantReply(envLegacy, 'epir-zareczyny', userText, req, {
      sessionId: sidLegacy,
      storefrontId: 'zareczyny',
      bodyChannel: 'hydrogen-zareczyny',
    });

    const sidV2 = 'sess_e2_parity_v2_gz';
    const {db: dbV, messageInserts: v2Inserts} = makeFakeD1Chatbot();
    const {env: envV2} = makeSessionDoEnv(dbV, sidV2);
    await stubGemmaIntentJson({
      slots: {product_type: 'kolczyki', recipient: 'fikcyjny odbiorca'},
    });
    const v2Reply = await composeGemmaReply(envV2, 'epir-zareczyny', userText, req, {
      sessionId: sidV2,
      storefrontId: 'zareczyny',
      bodyChannel: 'hydrogen-zareczyny',
    });

    const strip = (rows: CapturedMessageInsert[]) =>
      normalizeInserts(rows).map((r) => (r.role === 'assistant' ? {...r, content: '<reply>'} : r));
    expect(strip(legacyInserts)).toEqual(strip(v2Inserts));
    expect(legacyInserts.find((r) => r.role === 'assistant')?.content).toBe(legacyReply);
    expect(v2Inserts.find((r) => r.role === 'assistant')?.content).toBe(v2Reply);
    expect(v2Inserts.map((r) => r.role)).toEqual(['user', 'assistant']);
    for (const row of v2Inserts) {
      expect(row.channel).toBe('hydrogen-zareczyny');
      expect(row.storefront_id).toBe('zareczyny');
      expect(OPERATOR_STUDIO_CHANNELS).not.toContain(row.channel);
    }
  });

  it('T-PARITY-2 v2 handleBuyerTurn: set-session-id → set-storefront-context before append user/assistant', async () => {
    await stubGemmaIntentJson({
      slots: {product_type: 'kolczyki', recipient: 'fikcyjny odbiorca'},
    });
    const {namespace, calls} = makeTrackedSessionNamespace();
    const env = {
      SESSION_DO: namespace,
      GEMMA_RUNTIME_KV: makeGemmaRuntimeKv({
        channelMode: 'on',
        coreMode: 'v2',
        channelId: 'epir-online-store',
      }),
      ALLOWED_ORIGIN: '*',
      SHOP_DOMAIN: 'test-shop.myshopify.com',
    } as Env;

    const body = geBuyerBody({message: 'Fikcyjne zapytanie v2 kolejność'});
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

  it('T-PARITY-3 v2 (E5-D10): append failure returns same reply as success path', async () => {
    await stubGemmaIntentJson({
      slots: {product_type: 'kolczyki', recipient: 'fikcyjny odbiorca'},
    });
    const userText = 'Fikcyjne pytanie append fail parity';
    const opts = {
      sessionId: 'sess_e2_append_fail_v2',
      storefrontId: 'online-store',
      bodyChannel: 'online-store',
    };
    const {db: dbOk} = makeFakeD1Chatbot();
    const {env: envOk} = makeSessionDoEnv(dbOk, 'sess_e2_append_fail_v2');
    const replyOk = await composeGemmaReply(envOk, 'epir-online-store', userText, postReq({}), opts);

    vi.spyOn(sessionHistory, 'appendBuyerSessionMessage').mockRejectedValue(
      new Error('do down'),
    );
    const {db, messageInserts} = makeFakeD1Chatbot();
    const {env} = makeSessionDoEnv(db, 'sess_e2_append_fail_v2');
    const replyFail = await composeGemmaReply(env, 'epir-online-store', userText, postReq({}), opts);
    expect(replyFail).toBe(replyOk);
    expect(replyOk).not.toBe(gemmaV2EmergencyReply('epir-online-store'));
    expect(messageInserts.length).toBe(0);
  });

  it('T-NEG-1: message content has no serialized form/PII keys beyond user text', async () => {
    await stubGemmaIntentJson({
      slots: {product_type: 'kolczyki', recipient: 'fikcyjny odbiorca'},
    });
    const userText = 'Fikcyjne pytanie bez formularza';
    const {db, messageInserts} = makeFakeD1Chatbot();
    const {env} = makeSessionDoEnv(db, 'sess_e2_neg_form');
    await composeGemmaReply(env, 'epir-online-store', userText, postReq({}), {
      sessionId: 'sess_e2_neg_form',
      storefrontId: 'online-store',
      bodyChannel: 'online-store',
    });
    for (const row of messageInserts) {
      expect(row.content).not.toMatch(/customer_id_hint|form_|"email":/);
      if (row.role === 'user') expect(row.content).toBe(userText);
    }
  });

  it('T-NEG-2: v2 turn only user and assistant roles in D1 messages', async () => {
    await stubGemmaIntentJson({
      slots: {product_type: 'kolczyki', recipient: 'fikcyjny odbiorca'},
    });
    const {db, messageInserts} = makeFakeD1Chatbot();
    const {env} = makeSessionDoEnv(db, 'sess_e2_neg_roles');
    await composeGemmaReply(env, 'epir-zareczyny', 'Fikcyjne GZ role', postReq({}), {
      sessionId: 'sess_e2_neg_roles',
      storefrontId: 'zareczyny',
      bodyChannel: 'hydrogen-zareczyny',
    });
    expect(messageInserts.every((r) => r.role === 'user' || r.role === 'assistant')).toBe(
      true,
    );
  });
});
