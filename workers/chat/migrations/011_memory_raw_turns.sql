-- Migration 011: Raw user turns cold-store (opcjonalne, z twardym TTL).
-- Applied to DB_CHATBOT (ai-assistant-sessions-db).
--
-- Trzymamy WYŁĄCZNIE wypowiedzi klienta (role='user'). Treść asystenta
-- (szczególnie cytaty polityk) nigdy nie trafia do tej tabeli ani do
-- Vectorize `memory_customer` (kind='turn') — KB-clamp.
--
-- `expires_at` egzekwowane przez okresowy cleanup (cron / scheduled handler).
-- GDPR right-to-erasure: DELETE per customer_id propagowany też do Vectorize.

CREATE TABLE IF NOT EXISTS memory_raw_turns (
  id TEXT PRIMARY KEY,
  shopify_customer_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  message_id TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  text TEXT NOT NULL,
  text_masked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK (role = 'user')
);

CREATE INDEX IF NOT EXISTS idx_memory_raw_turns_customer ON memory_raw_turns(shopify_customer_id);
CREATE INDEX IF NOT EXISTS idx_memory_raw_turns_expires_at ON memory_raw_turns(expires_at);
CREATE INDEX IF NOT EXISTS idx_memory_raw_turns_session ON memory_raw_turns(session_id);
