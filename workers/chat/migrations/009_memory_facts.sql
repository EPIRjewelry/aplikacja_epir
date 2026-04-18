-- Migration 009: Typed customer facts (structured semantic memory).
-- Applied to DB_CHATBOT (ai-assistant-sessions-db).
--
-- Slot-filling rekord per trwała preferencja klienta. Źródłem prawdy dla
-- deterministycznego builder'a `person_memory.summary` oraz dla retrievalu
-- semantycznego (Vectorize `memory_customer`, kind='fact').
--
-- Zasada KB-clamp: slot `policy_text` nie istnieje. Policy-touch zapisywany
-- wyłącznie w `memory_events` jako audit-ref, nigdy jako `memory_facts.value`.

CREATE TABLE IF NOT EXISTS memory_facts (
  id TEXT PRIMARY KEY,
  shopify_customer_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  value TEXT NOT NULL,
  value_raw TEXT,
  confidence REAL NOT NULL DEFAULT 0.5,
  source_session_id TEXT,
  source_message_id TEXT,
  source_kind TEXT NOT NULL DEFAULT 'extractor',
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  superseded_by TEXT,
  CHECK (slot IN (
    'budget','metal','stone','ring_size','style','intent','event','product_interest','contact_pref','language'
  ))
);

CREATE INDEX IF NOT EXISTS idx_memory_facts_customer ON memory_facts(shopify_customer_id);
CREATE INDEX IF NOT EXISTS idx_memory_facts_customer_slot ON memory_facts(shopify_customer_id, slot);
CREATE INDEX IF NOT EXISTS idx_memory_facts_expires_at ON memory_facts(expires_at);
CREATE INDEX IF NOT EXISTS idx_memory_facts_superseded ON memory_facts(superseded_by);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_memory_facts_dedup
  ON memory_facts(shopify_customer_id, slot, value, source_message_id);
