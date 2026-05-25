export async function ensureStewardTables(db: D1Database): Promise<void> {
  const migrations = [
    `CREATE TABLE IF NOT EXISTS store_signals (
      id TEXT PRIMARY KEY,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      signal_key TEXT NOT NULL,
      storefront_id TEXT,
      channel TEXT,
      product_handle TEXT,
      product_id TEXT,
      metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL,
      metric_unit TEXT,
      evidence_json TEXT,
      source TEXT NOT NULL DEFAULT 'd1_pixel',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS steward_insights (
      id TEXT PRIMARY KEY,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      barrier TEXT,
      metric TEXT NOT NULL,
      baseline REAL,
      delta REAL,
      confidence REAL NOT NULL DEFAULT 0.5,
      summary TEXT NOT NULL,
      evidence_json TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS steward_reports (
      id TEXT PRIMARY KEY,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      report_markdown TEXT NOT NULL,
      run_id TEXT,
      agent_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ];
  for (const sql of migrations) {
    await db.prepare(sql).run();
  }
}
