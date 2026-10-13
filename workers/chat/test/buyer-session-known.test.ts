import {describe, expect, it} from 'vitest';
import {isBuyerChatSessionKnown} from '../src/buyer/session-context';
import {SessionDO} from '../src/index';
import type {Env} from '../src/config/bindings';
import {makeDurableStateStub} from './helpers/session-do-sql-stub';

describe('isBuyerChatSessionKnown', () => {
  it('returns false for empty SessionDO and no D1 row', async () => {
    const {state} = makeDurableStateStub('sess-empty');
    const instance = new SessionDO(state, {} as Env);
    const namespace = {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          instance.fetch(
            input instanceof Request
              ? input
              : new Request(new URL(String(input), 'https://session').toString(), init),
          ),
      }),
    } as unknown as DurableObjectNamespace;

    const env = {SESSION_DO: namespace} as Env;
    expect(await isBuyerChatSessionKnown(env, 'sess-empty')).toBe(false);
  });

  it('returns true after storefront context is set on SessionDO', async () => {
    const {state} = makeDurableStateStub('sess-with-storefront');
    const instance = new SessionDO(state, {} as Env);
    await instance.fetch(
      new Request('https://session/set-storefront-context', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({storefront_id: 'epir-liquid', channel: 'online-store'}),
      }),
    );

    const namespace = {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          instance.fetch(
            input instanceof Request
              ? input
              : new Request(new URL(String(input), 'https://session').toString(), init),
          ),
      }),
    } as unknown as DurableObjectNamespace;

    const env = {SESSION_DO: namespace} as Env;
    expect(await isBuyerChatSessionKnown(env, 'sess-with-storefront')).toBe(true);
  });
});
