import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { aggregateHamSignals, resolvedSignalKey } from './aggregate-ham';
import type { AnalysisPeriod } from './period';

const PERIOD: AnalysisPeriod = {
  period_start: '2026-09-27',
  period_end: '2026-10-04',
  cutoff_ms: Date.parse('2026-09-27T00:00:00.000Z'),
};

const EVENT_MS = Date.parse('2026-10-03T10:00:00.000Z');

/**
 * node:sqlite rejects `?1` numbered placeholders ("column index out of range")
 * once the statement has an expression ON CONFLICT target. D1 binds `?1` natively.
 * Rewrite to positional `?` in the order they already appear.
 */
function asD1(sqlite: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      const positional = sql.replace(/\?\d+/g, '?');
      const run = (...params: unknown[]) => {
        const stmt = sqlite.prepare(positional);
        return {
          async run() {
            stmt.run(...(params as never[]));
            return { success: true, meta: {} };
          },
          async all<T>() {
            return { results: stmt.all(...(params as never[])) as T[], success: true, meta: {} };
          },
          async first<T>() {
            return (stmt.get(...(params as never[])) as T | undefined) ?? null;
          },
        };
      };
      return {
        bind(...params: unknown[]) {
          return run(...params);
        },
        ...run(),
      };
    },
  } as unknown as D1Database;
}

function createStewardDb(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  const migration = readFileSync(fileURLToPath(new URL('../migrations/001_store_signals.sql', import.meta.url)), 'utf8');
  sqlite.exec(migration);
  sqlite.exec(`
    CREATE TABLE pixel_events (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      event_type TEXT,
      traffic_source TEXT,
      traffic_medium TEXT,
      traffic_campaign TEXT,
      click_id TEXT,
      click_id_type TEXT,
      channel TEXT,
      created_at INTEGER
    )
  `);
  return asD1(sqlite);
}

function insertSession(
  db: D1Database,
  row: { id: string; sessionId: string; campaign: string | null; medium?: string },
): Promise<unknown> {
  return db
    .prepare(
      `INSERT INTO pixel_events (
        id, session_id, event_type, traffic_source, traffic_medium, traffic_campaign, created_at
      ) VALUES (?1, ?2, 'page_viewed', 'google', ?3, ?4, ?5)`,
    )
    .bind(row.id, row.sessionId, row.medium ?? 'cpc', row.campaign, EVENT_MS)
    .run();
}

async function campaignRows(db: D1Database): Promise<Array<{ campaign: string; sessions: number }>> {
  const rows = await db
    .prepare(
      `SELECT metric_value, evidence_json FROM store_signals WHERE metric_name = 'resolved_session_count'`,
    )
    .bind()
    .all<{ metric_value: number; evidence_json: string }>();
  return (rows.results ?? []).map((row) => {
    const evidence = JSON.parse(row.evidence_json) as { resolved_campaign: string | null };
    return { campaign: evidence.resolved_campaign ?? '', sessions: row.metric_value };
  });
}

describe('aggregateHamSignals campaign slice', () => {
  it('persists two campaigns that share source and medium, then accepts the same period again', async () => {
    const db = createStewardDb();
    await insertSession(db, { id: '1', sessionId: 's-brand', campaign: 'brand_search' });
    await insertSession(db, { id: '2', sessionId: 's-pmax', campaign: 'pmax_catalog' });
    // Same joined underscore string if campaign is glued on with '_': google_cpc_brand_x.
    await insertSession(db, { id: '3', sessionId: 's-brand-x', campaign: 'brand_x' });
    await insertSession(db, { id: '4', sessionId: 's-split', campaign: 'x', medium: 'cpc_brand' });

    const first = await aggregateHamSignals(db, PERIOD);
    const resolved = first.filter((signal) => signal.metric_name === 'resolved_session_count');
    expect(resolved).toHaveLength(4);
    expect(new Set(resolved.map((signal) => signal.signal_key)).size).toBe(4);

    const index = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'uniq_store_signals_slice'`)
      .bind()
      .first<{ name: string }>();
    expect(index?.name).toBe('uniq_store_signals_slice');

    const afterFirst = await campaignRows(db);
    expect(afterFirst).toHaveLength(4);
    expect(afterFirst.find((row) => row.campaign === 'brand_search')?.sessions).toBe(1);
    expect(afterFirst.find((row) => row.campaign === 'pmax_catalog')?.sessions).toBe(1);
    expect(afterFirst.find((row) => row.campaign === 'brand_x')?.sessions).toBe(1);
    expect(afterFirst.find((row) => row.campaign === 'x')?.sessions).toBe(1);

    await insertSession(db, { id: '5', sessionId: 's-brand-2', campaign: 'brand_search' });
    await expect(aggregateHamSignals(db, PERIOD)).resolves.toEqual(expect.any(Array));

    const afterRepeat = await campaignRows(db);
    expect(afterRepeat).toHaveLength(4);
    expect(afterRepeat.find((row) => row.campaign === 'brand_search')?.sessions).toBe(2);
    expect(afterRepeat.find((row) => row.campaign === 'pmax_catalog')?.sessions).toBe(1);
    expect(resolvedSignalKey('google', 'cpc', 'brand_x')).not.toBe(resolvedSignalKey('google', 'cpc_brand', 'x'));
  });
});
