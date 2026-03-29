-- order_attributions: Shopify orders/create webhook → session linkage (idempotent by order GID)

CREATE TABLE IF NOT EXISTS order_attributions (
  shopify_order_gid TEXT PRIMARY KEY,
  order_name TEXT,
  epir_session_id TEXT,
  source TEXT,
  received_at INTEGER NOT NULL
);
