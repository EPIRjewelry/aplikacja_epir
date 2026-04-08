-- Migration 005: Append-only consent events (Consent Gate) w DB_CHATBOT
-- Purpose: Trwały audyt zgód z ingressu App Proxy i S2S
-- Run: wrangler d1 execute ai-assistant-sessions-db --remote --file=./migrations/005_consent_events.sql

CREATE TABLE IF NOT EXISTS consent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consent_id TEXT NOT NULL,
  granted INTEGER NOT NULL,
  source TEXT NOT NULL,
  storefront_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  shop_domain TEXT,
  route TEXT,
  session_id TEXT NOT NULL,
  anonymous_id TEXT,
  customer_id TEXT,
  event_timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consent_events_session_id ON consent_events(session_id);
CREATE INDEX IF NOT EXISTS idx_consent_events_created_at ON consent_events(created_at);
CREATE INDEX IF NOT EXISTS idx_consent_events_consent_id ON consent_events(consent_id);
