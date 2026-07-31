-- Example: Pipelines SQL stream → Iceberg sink (chat messages).
-- Copy/adapt in Cloudflare Dashboard or `wrangler pipelines`.
-- MUST stay aligned with docs/EPIR_ANALYTICS_DATA_CONTRACT.md § messages_raw.
-- Stream fields from workers/bigquery-batch exportMessages(): id, session_id, role,
-- content, timestamp, tool_calls, tool_call_id, name, storefront_id, channel
-- Target table: analytics.messages_raw
--
-- CRITICAL: without `name`, Q9_TOOL_USAGE fails (R2 SQL: No field named name).

INSERT INTO epir_messages_sink
SELECT
  id,
  session_id,
  role,
  content,
  model,
  tokens_used,
  "timestamp",
  name
FROM epir_messages_stream;
