-- customer_vip: Shopify Flow #4 VIP signal (idempotent by customer_id)
-- Run: wrangler d1 execute jewelry-analytics-db --local --file=./migrations/005_customer_vip.sql

CREATE TABLE IF NOT EXISTS customer_vip (
  customer_id TEXT PRIMARY KEY,
  orders_count INTEGER,
  source TEXT,
  marked_at INTEGER NOT NULL
);
