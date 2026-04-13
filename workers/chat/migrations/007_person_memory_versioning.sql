-- Person memory concurrency control: optimistic versioning + idempotency metadata.
-- Applied to DB_CHATBOT (ai-assistant-sessions-db).

ALTER TABLE person_memory ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE person_memory ADD COLUMN last_updated_by_request_id TEXT;

CREATE INDEX IF NOT EXISTS idx_person_memory_request_id ON person_memory(last_updated_by_request_id);
