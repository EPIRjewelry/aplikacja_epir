-- Migration 012: Add cached_tokens to usage_stats for prefix cache observability
-- Purpose: Workers AI (OpenAI-compat) zwraca usage.prompt_tokens_details.cached_tokens
--          gdy prefix cache trafi. Kolumna pozwala liczyć cache_hit_ratio w BigQuery /
--          dashboardach i korelować z latencją (stream_ready_ms w logach).
-- Rollback: ALTER TABLE usage_stats DROP COLUMN cached_tokens;
--           (SQLite wymaga recreate; zachować backup przed rollbackiem.)

ALTER TABLE usage_stats ADD COLUMN cached_tokens INTEGER NOT NULL DEFAULT 0;

-- Indeks pomocniczy przy raportach cache_hit_ratio per model / okno czasowe.
CREATE INDEX IF NOT EXISTS idx_usage_stats_cache_hit
  ON usage_stats(model, timestamp, cached_tokens);
