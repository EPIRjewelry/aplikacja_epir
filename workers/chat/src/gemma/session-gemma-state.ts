import type {Env} from '../config/bindings';
import {
  DEFAULT_GEMMA_SESSION_STATE,
  type GemmaSessionState,
} from './state/types';

function sessionStub(env: Env, sessionId: string) {
  const sid = sessionId.trim();
  if (!sid || !env.SESSION_DO) {
    throw new Error('session_id required for gemma-state');
  }
  return env.SESSION_DO.get(env.SESSION_DO.idFromName(sid));
}

export async function readGemmaState(
  env: Env,
  sessionId: string,
): Promise<GemmaSessionState> {
  const sid = sessionId.trim();
  if (!sid || !env.SESSION_DO) {
    return {...DEFAULT_GEMMA_SESSION_STATE};
  }
  try {
    const stub = sessionStub(env, sid);
    const res = await stub.fetch('https://session/gemma-state');
    if (!res.ok) return {...DEFAULT_GEMMA_SESSION_STATE};
    const raw = (await res.json().catch(() => null)) as GemmaSessionState | null;
    if (!raw || typeof raw !== 'object') return {...DEFAULT_GEMMA_SESSION_STATE};
    return {
      state: raw.state ?? DEFAULT_GEMMA_SESSION_STATE.state,
      slots: raw.slots ?? {},
      shown: Array.isArray(raw.shown) ? raw.shown : [],
      selected: raw.selected ?? null,
      form_of_address: raw.form_of_address ?? 'unknown',
      turn: typeof raw.turn === 'number' ? raw.turn : 0,
      discover_turns:
        typeof raw.discover_turns === 'number'
          ? raw.discover_turns
          : DEFAULT_GEMMA_SESSION_STATE.discover_turns,
    };
  } catch (e) {
    console.warn('[gemma.session_state] read failed', e);
    return {...DEFAULT_GEMMA_SESSION_STATE};
  }
}

export async function writeGemmaState(
  env: Env,
  sessionId: string,
  state: GemmaSessionState,
): Promise<void> {
  const sid = sessionId.trim();
  if (!sid || !env.SESSION_DO) return;
  try {
    const stub = sessionStub(env, sid);
    await stub.fetch('https://session/gemma-state', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(state),
    });
  } catch (e) {
    console.warn('[gemma.session_state] write failed', e);
    throw e;
  }
}
