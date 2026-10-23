import {SessionDO} from '../../../src/index';
import {makeDurableStateStub} from '../../helpers/session-do-sql-stub';

export type SessionDoCall = {path: string; body: unknown; doId: string};

export function makeTrackedSessionNamespace() {
  const calls: SessionDoCall[] = [];
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
                calls.push({path, body, doId: key});
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

export function callOrderIndexes(calls: SessionDoCall[], path: string): number[] {
  return calls.map((c, i) => (c.path === path ? i : -1)).filter((i) => i >= 0);
}
