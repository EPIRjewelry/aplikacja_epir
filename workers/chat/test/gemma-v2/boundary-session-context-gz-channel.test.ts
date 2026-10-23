import {describe, expect, it} from 'vitest';
import {SessionDO} from '../../src/index';
import type {Env} from '../../src/config/bindings';
import {ensureBuyerSessionContext} from '../../src/buyer/session-context';
import {makeDurableStateStub} from '../helpers/session-do-sql-stub';

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

describe('E0 boundary — GZ channel fallback (session-context.ts)', () => {
  it('epir-zareczyny bez storefrontId i bodyChannel → fallback channelId na hydrogen-zareczyny', async () => {
    const {namespace, calls} = makeSessionNamespace();
    const env = {SESSION_DO: namespace} as Env;
    const sid = 'sess_gz-fallback-fikcyjny';

    await ensureBuyerSessionContext(env, {
      sessionId: sid,
      channelId: 'epir-zareczyny',
      userText: 'Fikcyjne zapytanie GZ',
    });

    const sf = calls.find((c) => c.path === 'set-storefront-context');
    expect(sf).toBeDefined();
    expect((sf!.body as {channel?: string}).channel).toBe('hydrogen-zareczyny');
    expect((sf!.body as {storefront_id?: string | null}).storefront_id).toBeNull();
  });
});
