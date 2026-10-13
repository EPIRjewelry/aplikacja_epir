import {describe, expect, it} from 'vitest';
import {SessionDO} from '../src/index';
import type {Env} from '../src/config/bindings';
import {makeDurableStateStub} from './helpers/session-do-sql-stub';
import {postBuyerSessionPrivacy} from '../src/buyer/session-context';

function makeD1Capture() {
  const writes: Array<{sql: string; args: unknown[]}> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
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
}

function sessionConsentFromD1Writes(
  writes: Array<{sql: string; args: unknown[]}>,
): number | null | undefined {
  const sessionUpserts = writes.filter(
    (w) => w.sql.includes('INSERT INTO sessions') && w.sql.includes('analytics_consent'),
  );
  const sessionUpsert = sessionUpserts.at(-1);
  if (!sessionUpsert) return undefined;
  return sessionUpsert.args[14] as number | null;
}

describe('SessionDO POST /set-session-privacy', () => {
  const sid = 'sess_test-privacy-0001';

  async function flushPrivacyToD1(doStub: SessionDO) {
    await doStub.fetch(
      new Request('https://session/set-storefront-context', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({storefront_id: 'epir-liquid', channel: 'online-store'}),
      }),
    );
  }

  it('analytics_consent true → session_context and D1 sessions.analytics_consent = 1', async () => {
    const {db, writes} = makeD1Capture();
    const {state} = makeDurableStateStub(sid);
    const doStub = new SessionDO(state, {DB_CHATBOT: db} as Env);

    await doStub.fetch(
      new Request('https://session/set-session-id', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({session_id: sid}),
      }),
    );

    const res = await doStub.fetch(
      new Request('https://session/set-session-privacy', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({analytics_consent: true, session_id_source: 'session_storage'}),
      }),
    );
    expect(res.status).toBe(200);
    writes.length = 0;
    await flushPrivacyToD1(doStub);

    expect(sessionConsentFromD1Writes(writes)).toBe(1);
  });

  it('analytics_consent false → D1 sessions.analytics_consent = 0', async () => {
    const {db, writes} = makeD1Capture();
    const {state} = makeDurableStateStub(sid);
    const doStub = new SessionDO(state, {DB_CHATBOT: db} as Env);

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

    await doStub.fetch(
      new Request('https://session/set-session-privacy', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({analytics_consent: false}),
      }),
    );
    await flushPrivacyToD1(doStub);

    expect(sessionConsentFromD1Writes(writes)).toBe(0);
  });

  it('brak pola analytics_consent → COALESCE zachowuje poprzednią wartość w D1', async () => {
    const {db, writes} = makeD1Capture();
    const {state} = makeDurableStateStub(sid);
    const doStub = new SessionDO(state, {DB_CHATBOT: db} as Env);

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
    await flushPrivacyToD1(doStub);
    writes.length = 0;

    await doStub.fetch(
      new Request('https://session/set-session-privacy', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({session_id_source: 'session_storage'}),
      }),
    );
    await flushPrivacyToD1(doStub);

    expect(sessionConsentFromD1Writes(writes)).toBe(1);
  });
});

describe('postBuyerSessionPrivacy', () => {
  it('forwards analytics_consent to SessionDO set-session-privacy', async () => {
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

    const env = {SESSION_DO: namespace} as Env;
    await postBuyerSessionPrivacy(env, 'sess_forward-1', {analyticsConsent: 0});

    expect(calls.some((c) => c.path === 'set-session-privacy')).toBe(true);
    const privacy = calls.find((c) => c.path === 'set-session-privacy');
    expect(privacy?.body).toMatchObject({analytics_consent: 0});
  });
});
