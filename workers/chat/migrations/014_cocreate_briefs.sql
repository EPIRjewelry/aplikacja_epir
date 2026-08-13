-- Migration 014: Co-creation brief submissions (App Proxy /apps/assistant/cocreate)
-- Run: wrangler d1 execute ai-assistant-sessions-db --remote --file=./migrations/014_cocreate_briefs.sql

CREATE TABLE IF NOT EXISTS cocreate_briefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  storefront_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  shop_domain TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  phone TEXT,
  vision TEXT NOT NULL,
  brief_json TEXT NOT NULL,
  r2_key TEXT,
  r2_content_type TEXT,
  r2_bytes INTEGER,
  consent_project INTEGER NOT NULL DEFAULT 1,
  consent_marketing INTEGER NOT NULL DEFAULT 0,
  user_agent_trunc TEXT
);

CREATE INDEX IF NOT EXISTS idx_cocreate_briefs_created_at ON cocreate_briefs(created_at);
CREATE INDEX IF NOT EXISTS idx_cocreate_briefs_email_hash ON cocreate_briefs(email_hash);
CREATE INDEX IF NOT EXISTS idx_cocreate_briefs_status ON cocreate_briefs(status);
