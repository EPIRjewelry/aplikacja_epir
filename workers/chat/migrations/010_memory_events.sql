-- Migration 010: Audit-refs dla policy / product / cart touch.
-- Applied to DB_CHATBOT (ai-assistant-sessions-db).
--
-- Każdy zapis to referencja (policy_id, product gid, cart_id) + metadane
-- audytowe, a NIE treść polityki/produktu. KB-clamp: pełna treść polityk
-- pozostaje w Shopify Knowledge Base; retrieval per turę zawsze przez MCP.

CREATE TABLE IF NOT EXISTS memory_events (
  id TEXT PRIMARY KEY,
  shopify_customer_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  ref_version TEXT,
  content_hash TEXT,
  locale TEXT,
  market TEXT,
  session_id TEXT,
  tool_call_id TEXT,
  called_at INTEGER NOT NULL,
  meta_json TEXT,
  CHECK (kind IN ('policy_touch','product_touch','cart_touch','faq_touch'))
);

CREATE INDEX IF NOT EXISTS idx_memory_events_customer ON memory_events(shopify_customer_id);
CREATE INDEX IF NOT EXISTS idx_memory_events_customer_kind ON memory_events(shopify_customer_id, kind);
CREATE INDEX IF NOT EXISTS idx_memory_events_called_at ON memory_events(called_at);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_memory_events_toolcall
  ON memory_events(shopify_customer_id, tool_call_id)
  WHERE tool_call_id IS NOT NULL;
