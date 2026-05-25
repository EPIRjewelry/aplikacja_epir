-- Store Steward — wnioski analityczne (bariera opcjonalna do czasu diagnozy)

CREATE TABLE IF NOT EXISTS steward_insights (
  id              TEXT PRIMARY KEY,
  period_start    TEXT NOT NULL,
  period_end      TEXT NOT NULL,
  barrier         TEXT
    CHECK (barrier IS NULL OR barrier IN ('CENA', 'BRAK_INFO', 'TRUST', 'ROZMIAR', 'CZAS')),
  metric          TEXT NOT NULL,
  baseline        REAL,
  delta           REAL,
  confidence      REAL NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  summary         TEXT NOT NULL,
  evidence_json   TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'acted')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_steward_insights_period
  ON steward_insights (period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_steward_insights_barrier
  ON steward_insights (barrier) WHERE barrier IS NOT NULL;
