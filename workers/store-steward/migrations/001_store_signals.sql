-- Store Steward Faza 0 — agregaty zachowania klientów (źródło: pixel_events, R2 SQL)
-- Baza: jewelry-analytics-db

CREATE TABLE IF NOT EXISTS store_signals (
  id              TEXT PRIMARY KEY,
  period_start    TEXT NOT NULL,
  period_end      TEXT NOT NULL,
  signal_key      TEXT NOT NULL,
  storefront_id   TEXT,
  channel         TEXT,
  product_handle  TEXT,
  product_id      TEXT,
  metric_name     TEXT NOT NULL,
  metric_value    REAL NOT NULL,
  metric_unit     TEXT,
  evidence_json   TEXT,
  source          TEXT NOT NULL DEFAULT 'd1_pixel'
    CHECK (source IN ('d1_pixel', 'r2_sql')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_store_signals_period
  ON store_signals (period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_store_signals_key
  ON store_signals (signal_key, metric_name);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_store_signals_slice
  ON store_signals (
    period_start,
    period_end,
    signal_key,
    metric_name,
    COALESCE(storefront_id, ''),
    COALESCE(channel, ''),
    COALESCE(product_handle, ''),
    COALESCE(product_id, '')
  );
