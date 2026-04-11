-- Migration 006: Idempotent persistence UIDs + session persistence audit status.
-- Apply only after 003_storefront_messages.sql, 004_person_memory.sql, 005_consent_events.sql.

ALTER TABLE sessions ADD COLUMN storefront_id TEXT;
ALTER TABLE sessions ADD COLUMN channel TEXT;
ALTER TABLE sessions ADD COLUMN persist_status TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE sessions ADD COLUMN last_persist_error TEXT;
ALTER TABLE sessions ADD COLUMN last_persist_error_at INTEGER;

ALTER TABLE messages ADD COLUMN message_uid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_message_uid ON messages(message_uid);

ALTER TABLE tool_calls ADD COLUMN tool_call_uid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_calls_uid ON tool_calls(tool_call_uid);

ALTER TABLE usage_stats ADD COLUMN usage_uid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_stats_uid ON usage_stats(usage_uid);

ALTER TABLE cart_activity ADD COLUMN activity_uid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_activity_uid ON cart_activity(activity_uid);
