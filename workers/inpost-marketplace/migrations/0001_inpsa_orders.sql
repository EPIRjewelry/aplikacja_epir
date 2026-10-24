-- INPSA UC v1: poll cursor + idempotent Shopify creates.
-- Apply only after operator creates D1 and replaces placeholder database_id.
-- Do NOT run `wrangler d1 migrations apply` on jewelry-analytics-db or prod without approval.

CREATE TABLE IF NOT EXISTS inpsa_poll_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_success_event_id TEXT,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inpsa_processed_orders (
  marketplace_order_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  shopify_order_gid TEXT,
  status TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inpsa_processed_orders_key
  ON inpsa_processed_orders (idempotency_key);
