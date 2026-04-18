-- Person memory concurrency control: optimistic versioning + idempotency metadata.
-- Applied to DB_CHATBOT (ai-assistant-sessions-db).
-- If this file fails with duplicate column `version`, schema is already on DB: insert one row
-- into d1_migrations with name = this filename and id = MAX(id)+1, then re-run apply for 009+.

ALTER TABLE person_memory ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE person_memory ADD COLUMN last_updated_by_request_id TEXT;

CREATE INDEX IF NOT EXISTS idx_person_memory_request_id ON person_memory(last_updated_by_request_id);
