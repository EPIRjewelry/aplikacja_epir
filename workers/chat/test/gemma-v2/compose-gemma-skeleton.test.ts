import {describe, expect, it, vi} from 'vitest';
import {composeGemmaReply} from '../../src/gemma/compose-gemma-reply';
import {gemmaV2EmergencyReply} from '../../src/gemma/fallback';
import {stubGemmaIntentJson} from './helpers/stub-gemma-intent';
import {SessionDO} from '../../src/index';
import type {Env} from '../../src/config/bindings';
import {makeDurableStateStub} from '../helpers/session-do-sql-stub';

describe('E1 composeGemmaReply skeleton', () => {
  it('returns deterministic reply with mocked intent (no MCP)', async () => {
    await stubGemmaIntentJson({state: 'powitanie'});
    const ai = await import('../../src/ai-client');
    const groqSpy = vi.spyOn(ai, 'getGroqResponse');
    const streamSpy = vi.spyOn(ai, 'streamGroqEvents');

    const calls: string[] = [];
    const namespace = {
      idFromName(name: string) {
        return name;
      },
      get(id: string) {
        const durableState = makeDurableStateStub(String(id));
        const instance = new SessionDO(durableState.state, {} as never);
        return {
          fetch(input: RequestInfo | URL, init?: RequestInit) {
            const request =
              input instanceof Request
                ? input
                : new Request(new URL(String(input), 'https://session').toString(), init);
            const path = new URL(request.url).pathname.replace(/^\//, '');
            calls.push(path);
            return instance.fetch(request);
          },
        } as DurableObjectStub;
      },
    } as unknown as DurableObjectNamespace;

    const env = {SESSION_DO: namespace} as Env;
    const reply = await composeGemmaReply(
      env,
      'epir-online-store',
      'Fikcyjne zapytanie',
      new Request('https://example.com'),
      {
        sessionId: 'sess_gemma-v2-fikcyjny',
        storefrontId: 'online-store',
        bodyChannel: 'online-store',
      },
    );

    expect(reply).not.toBe(gemmaV2EmergencyReply('epir-online-store'));
    expect(reply).toMatch(/Panu lub Pani/i);
    expect(groqSpy).toHaveBeenCalled();
    expect(streamSpy).not.toHaveBeenCalled();
    expect(calls.some((p) => p === 'set-session-id')).toBe(true);
  });
});
