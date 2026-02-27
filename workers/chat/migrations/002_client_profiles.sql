-- Migration 002: Client Profiles & Engagement Metrics (Golden Record Pattern)
-- Optimistic Locking strategy via 'last_seen'
-- 'lead_score' constraints for engagement tracking
-- Tabela w DB_CHATBOT (ai-assistant-sessions-db) – ta sama baza co messages/sessions

CREATE TABLE IF NOT EXISTS client_profiles (
  client_id TEXT PRIMARY KEY,       -- UUID from Shopify Web Pixel
  created_at INTEGER NOT NULL,      -- First touch timestamp
  last_seen INTEGER NOT NULL,       -- Optimistic Locking / Last Interaction

  -- Core Identity (Golden Record)
  email TEXT,                       -- Normalized email (if identified)
  phone TEXT,                       -- Normalized phone (if identified)
  first_name TEXT,

  -- Engagement Metrics
  total_sessions INTEGER DEFAULT 1,
  lead_score INTEGER DEFAULT 0,     -- 0-100 score based on behavior
  conversion_probability REAL,      -- ML inference result (0.0-1.0)

  -- Context Memory (Warm Storage)
  ai_context TEXT,                  -- JSON Array of "Important Facts" (Max 20 items)
  preferences TEXT,                 -- JSON Object { "stones": [], "styles": [] }

  -- Constraints
  CHECK (lead_score >= 0 AND lead_score <= 100)
);

-- Partial Indexes for Analytics & Retargeting
CREATE INDEX IF NOT EXISTS idx_high_intent_leads
ON client_profiles(lead_score)
WHERE lead_score > 50;

CREATE INDEX IF NOT EXISTS idx_recent_visitors ON client_profiles(last_seen);
