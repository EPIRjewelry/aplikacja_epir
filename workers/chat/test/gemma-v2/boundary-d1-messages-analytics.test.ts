import {describe, expect, it} from 'vitest';
import {SessionDO} from '../../src/index';
import type {Env} from '../../src/config/bindings';
import {ensureBuyerSessionContext} from '../../src/buyer/session-context';
import {appendBuyerSessionMessage} from '../../src/buyer/session-history';
import {OPERATOR_STUDIO_CHANNELS} from '../../../bigquery-batch/src/gemma-channel-filter';
import {makeDurableStateStub} from '../helpers/session-do-sql-stub';
import {makeFakeD1Chatbot} from './fixtures/fake-d1-chatbot';
import {FIKCYJNY_SESSION_ID} from './fixtures/boundary-payloads';

function makeSessionDoEnv(d1: D1Database) {
  const durableState = makeDurableStateStub(FIKCYJNY_SESSION_ID);
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
  return {env: {SESSION_DO: namespace} as Env, instance};
}

describe('E0 boundary — D1 messages storefront_id/channel for analytics', () => {
  it('GE: persist messages with online-store channel and storefront_id', async () => {
    const {db, messageInserts} = makeFakeD1Chatbot();
    const {env} = makeSessionDoEnv(db);
    const sid = 'sess_d1-ge-fikcyjny-0001';

    await ensureBuyerSessionContext(env, {
      sessionId: sid,
      channelId: 'epir-online-store',
      storefrontId: 'online-store',
      bodyChannel: 'online-store',
      userText: 'Fikcyjne zapytanie GE',
    });
    await appendBuyerSessionMessage(env, sid, 'user', 'Fikcyjne zapytanie GE');

    expect(messageInserts).toHaveLength(1);
    expect(messageInserts[0]?.channel).toBe('online-store');
    expect(messageInserts[0]?.storefront_id).toBe('online-store');
    expect(messageInserts[0]?.role).toBe('user');
    expect(OPERATOR_STUDIO_CHANNELS).not.toContain(messageInserts[0]?.channel);
  });

  it('GZ: persist messages with hydrogen-zareczyny and storefront zareczyny', async () => {
    const {db, messageInserts} = makeFakeD1Chatbot();
    const {env} = makeSessionDoEnv(db);
    const sid = 'sess_d1-gz-fikcyjny-0002';

    await ensureBuyerSessionContext(env, {
      sessionId: sid,
      channelId: 'epir-zareczyny',
      storefrontId: 'zareczyny',
      bodyChannel: 'hydrogen-zareczyny',
      userText: 'Fikcyjne zapytanie GZ',
    });
    await appendBuyerSessionMessage(env, sid, 'user', 'Fikcyjne zapytanie GZ');

    expect(messageInserts).toHaveLength(1);
    expect(messageInserts[0]?.channel).toBe('hydrogen-zareczyny');
    expect(messageInserts[0]?.storefront_id).toBe('zareczyny');
    expect(OPERATOR_STUDIO_CHANNELS).not.toContain(messageInserts[0]?.channel);
  });

});
