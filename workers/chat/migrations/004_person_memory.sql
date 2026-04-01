-- Cross-session memory MVP (logged-in Shopify customers only).
-- Applied to DB_CHATBOT (ai-assistant-sessions-db).

CREATE TABLE IF NOT EXISTS person_memory (
  shopify_customer_id TEXT PRIMARY KEY,
  summary TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_person_memory_updated_at ON person_memory(updated_at);
