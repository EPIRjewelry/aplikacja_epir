-- Migration 003: batch_exports – śledzenie ostatnich eksportów do BigQuery
-- Tabela w DB (jewelry-analytics-db) – pojedynczy wiersz stanu

CREATE TABLE IF NOT EXISTS batch_exports (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_pixel_export_at INTEGER DEFAULT 0,
  last_messages_export_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);

-- Wstaw wiersz początkowy (jeśli brak)
INSERT OR IGNORE INTO batch_exports (id, last_pixel_export_at, last_messages_export_at, updated_at)
VALUES (1, 0, 0, 0);
