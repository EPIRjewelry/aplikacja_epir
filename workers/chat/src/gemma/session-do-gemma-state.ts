import {
  DEFAULT_GEMMA_SESSION_STATE,
  GEMMA_STATE_MAX_BYTES,
  GEMMA_STATE_POST_KEYS,
  type GemmaSessionState,
} from './state/types';

type SqlExec = {
  exec: (sql: string, ...args: unknown[]) => {one: () => Record<string, unknown> | null};
};

export function ensureGemmaStateTable(sql: SqlExec): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS gemma_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL
    )
  `);
  sql.exec(`INSERT OR IGNORE INTO gemma_state (id, payload) VALUES (1, ?)`, [
    JSON.stringify(DEFAULT_GEMMA_SESSION_STATE),
  ]);
}

function parsePayload(raw: unknown): GemmaSessionState {
  if (typeof raw !== 'string' || !raw.trim()) {
    return {...DEFAULT_GEMMA_SESSION_STATE};
  }
  try {
    const parsed = JSON.parse(raw) as GemmaSessionState;
    return {
      state: parsed.state ?? DEFAULT_GEMMA_SESSION_STATE.state,
      slots: parsed.slots ?? {},
      shown: Array.isArray(parsed.shown) ? parsed.shown : [],
      selected: parsed.selected ?? null,
      form_of_address: parsed.form_of_address ?? 'unknown',
      turn: typeof parsed.turn === 'number' ? parsed.turn : 0,
    };
  } catch {
    return {...DEFAULT_GEMMA_SESSION_STATE};
  }
}

export function readGemmaStateRow(sql: SqlExec): GemmaSessionState {
  ensureGemmaStateTable(sql);
  const row = sql.exec(`SELECT payload FROM gemma_state WHERE id = 1`).one();
  return parsePayload(row?.payload);
}

export function mergeGemmaStatePost(
  prev: GemmaSessionState,
  body: unknown,
): GemmaSessionState | {error: string} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {error: 'invalid_body'};
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!GEMMA_STATE_POST_KEYS.has(key)) {
      return {error: `disallowed_key:${key}`};
    }
  }
  const serialized = JSON.stringify(record);
  if (serialized.length > GEMMA_STATE_MAX_BYTES) {
    return {error: 'payload_too_large'};
  }
  return {
    state: (record.state as GemmaSessionState['state']) ?? prev.state,
    slots: (record.slots as GemmaSessionState['slots']) ?? prev.slots,
    shown: (record.shown as GemmaSessionState['shown']) ?? prev.shown,
    selected: (record.selected as GemmaSessionState['selected']) ?? prev.selected,
    form_of_address:
      (record.form_of_address as GemmaSessionState['form_of_address']) ?? prev.form_of_address,
    turn: typeof record.turn === 'number' ? record.turn : prev.turn,
  };
}

export function writeGemmaStateRow(sql: SqlExec, state: GemmaSessionState): void {
  ensureGemmaStateTable(sql);
  const payload = JSON.stringify(state);
  if (payload.length > GEMMA_STATE_MAX_BYTES) {
    throw new Error('gemma_state_payload_too_large');
  }
  sql.exec(`INSERT OR REPLACE INTO gemma_state (id, payload) VALUES (1, ?)`, [payload]);
}
