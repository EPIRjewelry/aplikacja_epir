import {describe, expect, it} from 'vitest';
import {SessionDO} from '../src/index';
import type {Env} from '../src/config/bindings';
import {makeDurableStateStub} from './helpers/session-do-sql-stub';
import {ensureBuyerSessionContext} from '../src/buyer/session-context';
import {appendBuyerSessionMessage} from '../src/buyer/session-history';
import {q1SessionsWithChatAndPurchase} from '../../bigquery-batch/src/q1-session-join';

function makeSessionNamespace() {
  const calls: Array<{path: string; body: unknown}> = [];
  const sessions = new Map<string, {instance: SessionDO}>();

  const namespace = {
    idFromName(name: string) {
      return name;
    },
    get(id: string) {
      const key = String(id);
      let session = sessions.get(key);
      if (!session) {
        const durableState = makeDurableStateStub(key);
        session = {instance: new SessionDO(durableState.state, {} as never)};
        sessions.set(key, session);
      }
      return {
        fetch(input: RequestInfo | URL, init?: RequestInit) {
          const request =
            input instanceof Request
              ? input
              : new Request(new URL(String(input), 'https://session').toString(), init);
          const path = new URL(request.url).pathname.replace(/^\//, '');
          if (request.method === 'POST') {
            return request
              .clone()
              .json()
              .then((body) => {
                calls.push({path, body});
                return session!.instance.fetch(request);
              });
          }
          return session!.instance.fetch(request);
        },
      } as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;

  return {namespace, calls};
}

describe('ensureBuyerSessionContext', () => {
  it('calls set-session-id and set-storefront-context before append', async () => {
    const {namespace, calls} = makeSessionNamespace();
    const env = {SESSION_DO: namespace} as Env;
    const sid = 'uuid-browser-session-1';
    await ensureBuyerSessionContext(env, {
      sessionId: sid,
      channelId: 'epir-online-store',
      storefrontId: 'epir-liquid',
      bodyChannel: 'online-store',
      userText: 'Cześć',
    });
    await appendBuyerSessionMessage(env, sid, 'user', 'Cześć');

    const paths = calls.map((c) => c.path);
    const setSidIdx = paths.indexOf('set-session-id');
    const setSfIdx = paths.indexOf('set-storefront-context');
    const appendIdx = paths.indexOf('append');
    expect(setSidIdx).toBeGreaterThanOrEqual(0);
    expect(setSfIdx).toBeGreaterThan(setSidIdx);
    expect(appendIdx).toBeGreaterThan(setSfIdx);
  });

  it('runs set-session-id on every turn (no turn cache)', async () => {
    const {namespace, calls} = makeSessionNamespace();
    const env = {SESSION_DO: namespace} as Env;
    const sid = 'uuid-repeat';
    const input = {
      sessionId: sid,
      channelId: 'epir-online-store' as const,
      storefrontId: 'epir-liquid',
      bodyChannel: 'online-store',
      userText: 'Hej',
    };
    await ensureBuyerSessionContext(env, input);
    await ensureBuyerSessionContext(env, input);
    const setSidCount = calls.filter((c) => c.path === 'set-session-id').length;
    expect(setSidCount).toBe(2);
  });

  it('does nothing without session_id', async () => {
    const {namespace, calls} = makeSessionNamespace();
    const env = {SESSION_DO: namespace} as Env;
    await ensureBuyerSessionContext(env, {
      channelId: 'epir-online-store',
      userText: 'Hej',
    });
    expect(calls).toEqual([]);
  });

  it('Q1 join matches pixel and chat on same UUID session_id', () => {
    const sid = '550e8400-e29b-41d4-a716-446655440000';
    const matched = q1SessionsWithChatAndPurchase(
      [
        {session_id: sid, event_type: 'page_viewed'},
        {session_id: sid, event_type: 'purchase_completed'},
      ],
      [{session_id: sid, role: 'user'}],
    );
    expect(matched.length).toBeGreaterThan(0);
  });
});
