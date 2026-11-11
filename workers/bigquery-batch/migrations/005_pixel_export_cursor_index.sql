-- Indeks kursora eksportu pixel_events → Pipelines.
--
-- Odczyt backlogu (SELECT paczki i COUNT pending) filtruje wyrażenie julianday/CASE
-- na created_at, nie samą kolumnę. idx_pixel_created_at tego nie obsługuje.
-- EXPLAIN bez tego indeksu: SCAN pixel_events + USE TEMP B-TREE FOR ORDER BY
-- (LIMIT nie ucina skanu). Z tym indeksem ten sam SQL:
-- SEARCH idx_pixel_export_cursor (<expr>>?).
--
-- Wyrażenia muszą zostać zgodne z PIXEL_CREATED_AT_MS_SQL i PIXEL_ID_TEXT_SQL
-- (workers/bigquery-batch/src/d1-timestamps.ts). Predykat zostaje w formie OR,
-- nie (expr, id) > (?, ?) — forma wierszowa schodzi do pełnego SCAN indeksu.
--
-- Zastosuj raz, poza cronem 02:00 UTC (budowa indeksu sama obciąża D1).
-- Deploy workera tej migracji nie uruchamia:
--   npx wrangler d1 execute jewelry-analytics-db --remote --file=./migrations/005_pixel_export_cursor_index.sql

CREATE INDEX IF NOT EXISTS idx_pixel_export_cursor
ON pixel_events (
  (
    CASE
      WHEN typeof(created_at) IN ('integer', 'real') THEN CAST(created_at AS INTEGER)
      WHEN typeof(created_at) = 'text' AND created_at NOT LIKE '%-%' AND created_at GLOB '[0-9]*'
        THEN CAST(created_at AS INTEGER)
      ELSE CAST((julianday(created_at) - 2440587.5) * 86400000.0 AS INTEGER)
    END
  ),
  CAST(id AS TEXT)
);
