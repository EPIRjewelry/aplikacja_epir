import type { WarehouseCqrsEnv } from './types';

export async function ensureWarehouseMaterializationTables(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS warehouse_serving_daily (
        snapshot_date TEXT PRIMARY KEY,
        event_rows INTEGER NOT NULL,
        approx_sessions REAL NOT NULL,
        chart_json TEXT NOT NULL,
        source_engine TEXT NOT NULL DEFAULT 'r2_sql',
        computed_at INTEGER NOT NULL
      )`,
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS warehouse_materialization_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_success_at INTEGER,
        last_error TEXT,
        last_event_rows INTEGER,
        updated_at INTEGER NOT NULL
      )`,
    )
    .run();
}

export function buildChartJson(input: {
  snapshot_date: string;
  event_rows: number;
  approx_sessions: number;
  approx_id_len_p50: number;
  raw_sample: unknown;
}): string {
  return JSON.stringify({
    version: 1,
    snapshot_date: input.snapshot_date,
    aggregates: {
      event_rows: input.event_rows,
      approx_sessions: input.approx_sessions,
      approx_id_len_p50: input.approx_id_len_p50,
      note: 'approx_sessions uses approx_distinct; approx_id_len_p50 uses approx_percentile_cont (probabilistic)',
    },
    series: [
      { label: 'events', value: input.event_rows },
      { label: 'approx_unique_sessions', value: Math.round(input.approx_sessions) },
    ],
    warehouse_sample: input.raw_sample,
  });
}

export async function upsertServingDay(
  db: D1Database,
  row: { snapshot_date: string; event_rows: number; approx_sessions: number; chart_json: string; computed_at: number },
): Promise<void> {
  await ensureWarehouseMaterializationTables(db);
  await db
    .prepare(
      `INSERT INTO warehouse_serving_daily (snapshot_date, event_rows, approx_sessions, chart_json, computed_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(snapshot_date) DO UPDATE SET
         event_rows = excluded.event_rows,
         approx_sessions = excluded.approx_sessions,
         chart_json = excluded.chart_json,
         computed_at = excluded.computed_at`,
    )
    .bind(row.snapshot_date, row.event_rows, row.approx_sessions, row.chart_json, row.computed_at)
    .run();
}

export async function writeMaterializationMeta(
  db: D1Database,
  ok: boolean,
  detail: { event_rows?: number; error?: string },
): Promise<void> {
  await ensureWarehouseMaterializationTables(db);
  const now = Date.now();
  if (ok) {
    await db
      .prepare(
        `INSERT INTO warehouse_materialization_meta (id, last_success_at, last_error, last_event_rows, updated_at)
         VALUES (1, ?1, NULL, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET
           last_success_at = excluded.last_success_at,
           last_error = NULL,
           last_event_rows = excluded.last_event_rows,
           updated_at = excluded.updated_at`,
      )
      .bind(now, detail.event_rows ?? 0, now)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO warehouse_materialization_meta (id, last_success_at, last_error, last_event_rows, updated_at)
         VALUES (1, NULL, ?1, NULL, ?2)
         ON CONFLICT(id) DO UPDATE SET
           last_error = excluded.last_error,
           updated_at = excluded.updated_at`,
      )
      .bind(detail.error ?? 'unknown', now)
      .run();
  }
}
