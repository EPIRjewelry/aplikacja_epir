/**
 * E3 SessionDO /gemma-state — mutacje:
 * - **M-E3-1** — usuń POST po turze → STATE-1 / COMPOSE-1 FAIL
 * - **M-E3-5** — nie zapisuj slots → STATE-2 / COMPOSE-3 FAIL
 * - **M-E3-6** — GET zawsze {} → COMPOSE-3 / SALES-2 FAIL
 * - **M-E5-9** — brak walidacji zagnieżdżonej → T-E5-STATE-1/2 FAIL
 */
import {describe, expect, it} from 'vitest';
import {SessionDO} from '../../src/index';
import type {Env} from '../../src/config/bindings';
import {makeDurableStateStub} from '../helpers/session-do-sql-stub';
import {readGemmaState, writeGemmaState} from '../../src/gemma/session-gemma-state';

function makeEnv(shard: string) {
  const durableState = makeDurableStateStub(shard);
  const instance = new SessionDO(durableState.state, {} as Env);
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
  return {env: {SESSION_DO: namespace} as Env, durableState};
}

describe('E3 gemma-state SessionDO', () => {
  it('T-E3-STATE-1: POST then GET roundtrip slots/state', async () => {
    const {env} = makeEnv('sess_e3_state_1');
    const sid = 'sess_e3_state_1';
    await writeGemmaState(env, sid, {
      state: 'potrzeby',
      slots: {metal: 'złoto'},
      shown: [],
      selected: null,
      form_of_address: 'unknown',
      turn: 2,
    });
    const read = await readGemmaState(env, sid);
    expect(read.state).toBe('potrzeby');
    expect(read.slots.metal).toBe('złoto');
    expect(read.turn).toBe(2);
  });

  it('T-E3-STATE-2: turn increments via client write', async () => {
    const {env} = makeEnv('sess_e3_state_2');
    const sid = 'sess_e3_state_2';
    const base = await readGemmaState(env, sid);
    await writeGemmaState(env, sid, {...base, turn: base.turn + 1, slots: {budget: 'fikcyjny'}});
    const after = await readGemmaState(env, sid);
    expect(after.turn).toBe(1);
    expect(after.slots.budget).toBe('fikcyjny');
  });

  it('T-E5-STATE-1: POST rejects nested invalid slots', async () => {
    const {env} = makeEnv('sess_e5_state_1');
    const stub = env.SESSION_DO!.get(env.SESSION_DO!.idFromName('sess_e5_state_1'));
    const res = await stub.fetch('https://session/gemma-state', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({slots: {evil: 1}}),
    });
    expect(res.status).toBe(400);
  });

  it('T-E5-STATE-2: POST rejects shown item with extra keys', async () => {
    const {env} = makeEnv('sess_e5_state_2');
    const stub = env.SESSION_DO!.get(env.SESSION_DO!.idFromName('sess_e5_state_2'));
    const res = await stub.fetch('https://session/gemma-state', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        shown: [{ref: 'g1', productId: 'p', handle: 'h', variantIds: [], url: '/x', extra: 1}],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('T-E3-STATE-3: POST rejects disallowed keys', async () => {
    const {env, durableState} = makeEnv('sess_e3_state_3');
    const stub = env.SESSION_DO!.get(env.SESSION_DO!.idFromName('sess_e3_state_3'));
    const res = await stub.fetch('https://session/gemma-state', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({user_text: 'sekret'}),
    });
    expect(res.status).toBe(400);
    expect(durableState.inspect.getGemmaStatePayload()).toContain('powitanie');
  });
});
