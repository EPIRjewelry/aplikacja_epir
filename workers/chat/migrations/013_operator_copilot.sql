-- Project B: profil operatora, digest sesji, dzienne raporty (D1 ai-assistant-sessions-db)

CREATE TABLE IF NOT EXISTS internal_operator_profile (
  operator_id TEXT PRIMARY KEY DEFAULT 'default',
  brand_notes TEXT NOT NULL DEFAULT '',
  default_workflow_id TEXT NOT NULL DEFAULT 'data_warehouse',
  campaign_priorities TEXT,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO internal_operator_profile (operator_id, brand_notes, default_workflow_id, campaign_priorities, updated_at)
VALUES ('default', '', 'data_warehouse', NULL, 0);

CREATE TABLE IF NOT EXISTS internal_session_digest (
  session_id TEXT PRIMARY KEY,
  digest TEXT NOT NULL DEFAULT '',
  message_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_digest_updated ON internal_session_digest(updated_at);

CREATE TABLE IF NOT EXISTS operator_daily_reports (
  report_date TEXT PRIMARY KEY,
  markdown_body TEXT NOT NULL,
  edog_verdict TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
