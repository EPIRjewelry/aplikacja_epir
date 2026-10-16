import type {Env} from '../config/bindings';

export type BuyerHistoryEntry = {role: 'user' | 'assistant'; content: string};

function sessionStub(env: Env, sessionId: string) {
  const sid = sessionId.trim();
  if (!sid) {
    throw new Error('session_id required for SessionDO history access');
  }
  return env.SESSION_DO.get(env.SESSION_DO.idFromName(sid));
}

export function normalizeBuyerSessionHistory(raw: unknown): BuyerHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => typeof entry === 'object' && entry !== null)
    .map((entry) => entry as {role?: string; content?: string})
    .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
    .map((entry) => ({
      role: entry.role as 'user' | 'assistant',
      content: typeof entry.content === 'string' ? entry.content.trim() : '',
    }))
    .filter((entry) => entry.content.length > 0);
}

export async function readBuyerSessionHistory(
  env: Env,
  sessionId: string,
): Promise<BuyerHistoryEntry[]> {
  const sid = sessionId.trim();
  if (!sid || !env.SESSION_DO) return [];
  try {
    const stub = sessionStub(env, sid);
    const res = await stub.fetch('https://session/history');
    if (!res.ok) return [];
    const raw = await res.json().catch(() => []);
    return normalizeBuyerSessionHistory(raw);
  } catch (e) {
    console.warn('[buyer.session_history] read failed', e);
    return [];
  }
}

export function lastBuyerHistoryEntries(
  history: BuyerHistoryEntry[],
  max = 8,
): BuyerHistoryEntry[] {
  return history.slice(-max);
}

export async function appendBuyerSessionMessage(
  env: Env,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  const sid = sessionId.trim();
  const text = content.trim();
  if (!sid || !text || !env.SESSION_DO) return;
  try {
    const stub = sessionStub(env, sid);
    await stub.fetch('https://session/append', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({role, content: text}),
    });
  } catch (e) {
    console.warn('[buyer.session_history] append failed', e);
  }
}
