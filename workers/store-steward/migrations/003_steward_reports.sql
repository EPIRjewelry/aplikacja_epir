-- Raporty dzienne z Cursor SDK (Faza 0 output)

CREATE TABLE IF NOT EXISTS steward_reports (
  id              TEXT PRIMARY KEY,
  period_start    TEXT NOT NULL,
  period_end      TEXT NOT NULL,
  report_markdown TEXT NOT NULL,
  run_id          TEXT,
  agent_id        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_steward_reports_period
  ON steward_reports (period_start, period_end);
