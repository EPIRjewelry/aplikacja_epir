import {describe, expect, it, vi} from 'vitest';
import {SessionDO} from '../src/index';
import type {Env} from '../src/config/bindings';
import {handleChatSessionLinkedFromPixel} from '../src/buyer/session-context';
import {makeDurableStateStub} from './helpers/session-do-sql-stub';

function makeEnvWithSession(sid: string, d1Consent: number | null) {
  const sessions = new Map<string, {instance: SessionDO}>();
  const {db, writes} = (() => {
    const writes: Array<{sql: string; args: unknown[]}> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async first() {
                if (sql.includes('FROM sessions') && sql.includes('analytics_consent')) {
                  return {analytics_consent: d1Consent};
                }
                if (sql.includes('SELECT session_id FROM sessions')) {
                  return d1Consent === null && !sql.includes('analytics')
                    ? null
                    : {session_id: sid};
                }
                return null;
              },
              async run() {
                writes.push({sql, args});
                return {success: true, meta: {}};
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    return {db, writes};
  })();

  // Known session: SELECT session_id always finds row when we want known
  const dbKnown = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes('SELECT session_id FROM sessions')) {
                return {session_id: sid};
              }
              if (sql.includes('analytics_consent')) {
                return {analytics_consent: d1Consent};
              }
              return null;
            },
            async run() {
              writes.push({sql, args});
              return {success: true, meta: {}};
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  const namespace = {
    idFromName(name: string) {
      return name;
    },
    get(id: string) {
      const key = String(id);
      let session = sessions.get(key);
      if (!session) {
        const durableState = makeDurableStateStub(key);
        session = {
          instance: new SessionDO(durableState.state, {DB_CHATBOT: dbKnown} as Env),
        };
        sessions.set(key, session);
      }
      return {
        fetch(input: RequestInfo | URL, init?: RequestInit) {
          const request =
            input instanceof Request
              ? input
              : new Request(new URL(String(input), 'https://session').toString(), init);
          return session!.instance.fetch(request);
        },
      } as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;

  return {
    env: {SESSION_DO: namespace, DB_CHATBOT: dbKnown} as Env,
    writes,
    getDo: () => sessions.get(sid)?.instance,
  };
}

describe('handleChatSessionLinkedFromPixel', () => {
  const sid = 'sess_link-known-0001';

  it('links analytics_client_id when session known and consent=1', async () => {
    const {env, writes} = makeEnvWithSession(sid, 1);
    const doStub = (
      env.SESSION_DO as unknown as {
        get: (id: string) => {fetch: (r: Request) => Promise<Response>};
      }
    ).get(sid);

    await doStub.fetch(
      new Request('https://session/set-session-id', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({session_id: sid}),
      }),
    );
    await doStub.fetch(
      new Request('https://session/set-session-privacy', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({analytics_consent: true}),
      }),
    );
    writes.length = 0;

    const result = await handleChatSessionLinkedFromPixel(env, {
      type: 'chat_session_linked',
      data: {chat_session_id: sid, client_id: 'pixel-client-xyz'},
    });
    expect(result).toBe('linked');

    await doStub.fetch(
      new Request('https://session/set-storefront-context', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({storefront_id: 'epir-liquid', channel: 'online-store'}),
      }),
    );

    const upsert = writes
      .filter((w) => w.sql.includes('INSERT INTO sessions') && w.sql.includes('analytics_client_id'))
      .at(-1);
    expect(upsert?.args[16]).toBe('pixel-client-xyz');
  });

  it('ignores when consent is not 1', async () => {
    const {env} = makeEnvWithSession(sid, 0);
    const result = await handleChatSessionLinkedFromPixel(env, {
      type: 'chat_session_linked',
      data: {chat_session_id: sid, client_id: 'pixel-client-xyz'},
    });
    expect(result).toBe('ignored');
  });

  it('ignores invalid chat_session_id', async () => {
    const {env} = makeEnvWithSession(sid, 1);
    const result = await handleChatSessionLinkedFromPixel(env, {
      type: 'chat_session_linked',
      data: {chat_session_id: 'not-sess', client_id: 'pixel-client-xyz'},
    });
    expect(result).toBe('ignored');
  });
});
