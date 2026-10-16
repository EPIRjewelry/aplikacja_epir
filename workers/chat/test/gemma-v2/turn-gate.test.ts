/**
 * E3 BuyerTurnGate wrapper — mutacje:
 * - **M-E3-2** — wyłącz withBuyerTurnGate → GATE-1 FAIL
 * - **M-E3-12** — end poza finally → GATE-3 FAIL
 */
import {describe, expect, it, vi} from 'vitest';
import {withBuyerTurnGate} from '../../src/gemma/turn-gate';
import {SessionDO} from '../../src/index';
import type {Env} from '../../src/config/bindings';
import {makeDurableStateStub} from '../helpers/session-do-sql-stub';

describe('E3 withBuyerTurnGate', () => {
  it('T-E3-GATE-1: begin before callback and end in finally', async () => {
    const calls: string[] = [];
    const durableState = makeDurableStateStub('sess_gate_1');
    const instance = new SessionDO(durableState.state, {} as Env);
    const namespace = {
      idFromName(name: string) {
        return name;
      },
      get() {
        return {
          fetch(input: RequestInfo | URL, init?: RequestInit) {
            const request =
              input instanceof Request
                ? input
                : new Request(new URL(String(input), 'https://session').toString(), init);
            calls.push(new URL(request.url).pathname.replace(/^\//, ''));
            return instance.fetch(request);
          },
        } as DurableObjectStub;
      },
    } as unknown as DurableObjectNamespace;
    const env = {SESSION_DO: namespace} as Env;

    let mid = false;
    await withBuyerTurnGate(env, 'sess_gate_1', 'turn-fikcyjny', async () => {
      mid = true;
      expect(calls).toContain('begin-buyer-turn');
      expect(calls).not.toContain('end-buyer-turn');
    });
    expect(mid).toBe(true);
    expect(calls.indexOf('begin-buyer-turn')).toBeLessThan(calls.indexOf('end-buyer-turn'));
  });

  it('T-E3-GATE-3: thrown error still ends buyer turn', async () => {
    const calls: string[] = [];
    const durableState = makeDurableStateStub('sess_gate_3');
    const instance = new SessionDO(durableState.state, {} as Env);
    const namespace = {
      idFromName(name: string) {
        return name;
      },
      get() {
        return {
          fetch(input: RequestInfo | URL, init?: RequestInit) {
            const request =
              input instanceof Request
                ? input
                : new Request(new URL(String(input), 'https://session').toString(), init);
            calls.push(new URL(request.url).pathname.replace(/^\//, ''));
            return instance.fetch(request);
          },
        } as DurableObjectStub;
      },
    } as unknown as DurableObjectNamespace;
    const env = {SESSION_DO: namespace} as Env;
    await expect(
      withBuyerTurnGate(env, 'sess_gate_3', 'turn-err', async () => {
        throw new Error('fikcyjny błąd tury');
      }),
    ).rejects.toThrow('fikcyjny błąd tury');
    expect(calls).toContain('end-buyer-turn');
  });
});
