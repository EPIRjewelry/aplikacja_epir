import {describe, expect, it} from 'vitest';
import worker, {SessionDO} from '../src/index';
import type {Env} from '../src/config/bindings';
import {
  ensureBuyerSessionContext,
  handleChatSessionLinkedFromPixel,
} from '../src/buyer/session-context';
import {makeDurableStateStub} from './helpers/session-do-sql-stub';

const noopCtx = {waitUntil() {}} as unknown as ExecutionContext;

type SessionRow = {
  session_id: string;
  analytics_consent: number | null;
  analytics_client_id: string | null;
};

/**
 * D1 `sessions` w pamięci: upsert z `SessionDO.persistSessionRecord`
 * (args[0] = session_id, args[14] = analytics_consent, args[16] = analytics_client_id)
 * z tą samą semantyką COALESCE/CASE co SQL w produkcji.
 */
function makeSessionsD1(options: {failSessionWrites?: boolean} = {}) {
  const rows = new Map<string, SessionRow>();
  const sessionWrites: unknown[][] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              const sid = String(args[0]);
              const row = rows.get(sid);
              if (!row) return null;
              if (sql.includes('SELECT session_id FROM sessions')) {
                return {session_id: row.session_id};
              }
              if (sql.includes('analytics_client_id') && sql.includes('FROM sessions')) {
                return {
                  analytics_consent: row.analytics_consent,
                  analytics_client_id: row.analytics_client_id,
                };
              }
              if (sql.includes('analytics_consent') && sql.includes('FROM sessions')) {
                return {analytics_consent: row.analytics_consent};
              }
              return null;
            },
            async run() {
              if (sql.includes('INSERT INTO sessions')) {
                if (options.failSessionWrites) throw new Error('D1 unavailable');
                sessionWrites.push(args);
                const sid = String(args[0]);
                const consent = args[14] as number | null;
                const client = args[16] as string | null;
                const prev = rows.get(sid);
                rows.set(sid, {
                  session_id: sid,
                  analytics_consent: consent ?? prev?.analytics_consent ?? null,
                  analytics_client_id:
                    consent === 0 ? null : client ?? prev?.analytics_client_id ?? null,
                });
              }
              return {success: true, meta: {}};
            },
            async all() {
              return {results: []};
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return {db, rows, sessionWrites};
}

function makeEnv(options: {failSessionWrites?: boolean} = {}) {
  const d1 = makeSessionsD1(options);
  const instances = new Map<string, SessionDO>();
  const proxied: string[] = [];
  const namespace = {
    idFromName(name: string) {
      return name;
    },
    get(id: string) {
      const key = String(id);
      let instance = instances.get(key);
      if (!instance) {
        instance = new SessionDO(makeDurableStateStub(key).state, {DB_CHATBOT: d1.db} as Env);
        instances.set(key, instance);
      }
      return {
        fetch(input: RequestInfo | URL, init?: RequestInit) {
          const request =
            input instanceof Request
              ? input
              : new Request(new URL(String(input), 'https://session').toString(), init);
          return instance!.fetch(request);
        },
      } as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
  const env = {
    SESSION_DO: namespace,
    DB_CHATBOT: d1.db,
    ANALYTICS_WORKER: {
      async fetch(input: RequestInfo | URL, init?: RequestInit) {
        const req = input instanceof Request ? input : new Request(String(input), init);
        proxied.push(await req.text());
        return new Response('{"ok":true}', {status: 200});
      },
    },
  } as unknown as Env;
  return {env, ...d1, proxied};
}

/** Pierwsza wiadomość klienta: ta sama ścieżka co tura czatu (handle-buyer-turn → ensureBuyerSessionContext). */
async function firstBuyerMessage(env: Env, sid: string, analyticsConsent: 0 | 1) {
  await ensureBuyerSessionContext(env, {
    sessionId: sid,
    channelId: 'online-store' as never,
    storefrontId: 'epir-liquid',
    bodyChannel: 'online-store',
    userText: 'Dzień dobry',
    analyticsConsent,
    sessionIdSource: 'session_storage',
  });
}

function linkPayload(sid: string, clientId = 'pixel-client-xyz') {
  return {
    type: 'chat_session_linked',
    data: {
      chat_session_id: sid,
      client_id: clientId,
      session_id: clientId,
      pixel_sender: 'web_pixel_extension',
    },
  };
}

async function postPixel(env: Env, body: unknown) {
  const res = await worker.fetch(
    new Request('https://asystent.epirbizuteria.pl/pixel', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    }),
    env,
    noopCtx,
  );
  return {status: res.status, json: (await res.json()) as Record<string, unknown>};
}

describe('handleChatSessionLinkedFromPixel', () => {
  const sid = 'sess_link-known-0001';

  it('unknown session (widget minted sess_*, no message yet) -> unknown_session, nothing written', async () => {
    const {env, rows, sessionWrites} = makeEnv();
    const result = await handleChatSessionLinkedFromPixel(env, linkPayload(sid));
    expect(result).toBe('unknown_session');
    expect(rows.size).toBe(0);
    expect(sessionWrites).toHaveLength(0);
  });

  it('existing consented session -> linked and D1 sessions.analytics_client_id written', async () => {
    const {env, rows} = makeEnv();
    await firstBuyerMessage(env, sid, 1);
    expect(rows.get(sid)).toMatchObject({analytics_consent: 1, analytics_client_id: null});

    const result = await handleChatSessionLinkedFromPixel(env, linkPayload(sid));
    expect(result).toBe('linked');
    expect(rows.get(sid)?.analytics_client_id).toBe('pixel-client-xyz');
  });

  it('repeat of the same pair is idempotent (linked, no second write)', async () => {
    const {env, rows, sessionWrites} = makeEnv();
    await firstBuyerMessage(env, sid, 1);
    expect(await handleChatSessionLinkedFromPixel(env, linkPayload(sid))).toBe('linked');
    const writesAfterFirst = sessionWrites.length;

    expect(await handleChatSessionLinkedFromPixel(env, linkPayload(sid))).toBe('linked');
    expect(sessionWrites.length).toBe(writesAfterFirst);
    expect(rows.get(sid)?.analytics_client_id).toBe('pixel-client-xyz');
  });

  it('link survives later buyer turns (they do not clear analytics_client_id)', async () => {
    const {env, rows} = makeEnv();
    await firstBuyerMessage(env, sid, 1);
    await handleChatSessionLinkedFromPixel(env, linkPayload(sid));
    await firstBuyerMessage(env, sid, 1);
    expect(rows.get(sid)?.analytics_client_id).toBe('pixel-client-xyz');
  });

  it('root cause path: link before first message is not final; retry after message links', async () => {
    const {env, rows} = makeEnv();
    expect(await handleChatSessionLinkedFromPixel(env, linkPayload(sid))).toBe('unknown_session');
    await firstBuyerMessage(env, sid, 1);
    expect(await handleChatSessionLinkedFromPixel(env, linkPayload(sid))).toBe('linked');
    expect(rows.get(sid)?.analytics_client_id).toBe('pixel-client-xyz');
  });

  it('consent 0 -> no_consent, analytics_client_id stays null', async () => {
    const {env, rows} = makeEnv();
    await firstBuyerMessage(env, sid, 0);
    expect(await handleChatSessionLinkedFromPixel(env, linkPayload(sid))).toBe('no_consent');
    expect(rows.get(sid)?.analytics_client_id).toBeNull();
  });

  it('invalid chat_session_id or missing client_id -> invalid', async () => {
    const {env} = makeEnv();
    expect(await handleChatSessionLinkedFromPixel(env, linkPayload('not-sess'))).toBe('invalid');
    expect(await handleChatSessionLinkedFromPixel(env, linkPayload(sid, ''))).toBe('invalid');
  });
});

describe('POST /pixel chat_session_linked (ack, no proxy)', () => {
  const sid = 'sess_link-route-0001';

  it('unknown session -> 200 {ok, linked:false, reason} and not proxied to analytics', async () => {
    const {env, proxied} = makeEnv();
    const {status, json} = await postPixel(env, linkPayload(sid));
    expect(status).toBe(200);
    expect(json).toEqual({ok: true, linked: false, reason: 'unknown_session'});
    expect(proxied).toHaveLength(0);
  });

  it('consented session -> 200 {ok, linked:true}, written, not proxied; repeat idempotent', async () => {
    const {env, rows, proxied} = makeEnv();
    await firstBuyerMessage(env, sid, 1);
    expect((await postPixel(env, linkPayload(sid))).json).toEqual({ok: true, linked: true});
    expect((await postPixel(env, linkPayload(sid))).json).toEqual({ok: true, linked: true});
    expect(rows.get(sid)?.analytics_client_id).toBe('pixel-client-xyz');
    expect(proxied).toHaveLength(0);
  });

  it('D1 write of analytics_client_id not confirmed -> linked:false reason error', async () => {
    const control = {failSessionWrites: false};
    const {env, rows} = makeEnv(control);
    await firstBuyerMessage(env, sid, 1);
    // SessionDO łapie błąd D1 tylko w logu, więc ack musi wynikać z odczytu, nie z HTTP 200 z DO.
    control.failSessionWrites = true;
    const {json} = await postPixel(env, linkPayload(sid));
    expect(json).toEqual({ok: true, linked: false, reason: 'error'});
    expect(rows.get(sid)?.analytics_client_id).toBeNull();
  });

  it('other pixel events are still proxied to analytics unchanged', async () => {
    const {env, proxied} = makeEnv();
    const body = {type: 'page_viewed', data: {session_id: 'pixel-client-xyz'}};
    const {status} = await postPixel(env, body);
    expect(status).toBe(200);
    expect(proxied).toHaveLength(1);
    expect(JSON.parse(proxied[0])).toEqual(body);
  });
});
