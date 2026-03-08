-- Migration 003: Add storefront_id and channel to messages (ANALYTICS_KB)
-- Purpose: Enable segmentacja kazka vs zareczyny in BigQuery messages_raw
-- Run: wrangler d1 execute ai-assistant-sessions-db --remote --file=./migrations/003_storefront_messages.sql

ALTER TABLE messages ADD COLUMN storefront_id TEXT;
ALTER TABLE messages ADD COLUMN channel TEXT;
