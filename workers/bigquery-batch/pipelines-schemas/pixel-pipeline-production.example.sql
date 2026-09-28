-- Example: Pipelines SQL stream → Iceberg sink (pixel).
-- Prod copy: pixel-pipeline-production.sql
-- Stream (CF): session_id, event_type, timestamp (int64 ms), page_url, referrer, utm_*, …
-- Batch maps D1 → stream in workers/bigquery-batch/src/pixel-pipeline-record.ts

INSERT INTO epir_pixel_events_sink (
  id,
  session_id,
  event_type,
  page_url,
  referrer_url,
  utm_source,
  utm_medium,
  utm_campaign,
  user_agent,
  ip_address,
  shop_domain,
  customer_id,
  order_id,
  timestamp,
  created_at
)
SELECT
  id,
  session_id,
  event_type,
  page_url,
  referrer AS referrer_url,
  utm_source,
  utm_medium,
  utm_campaign,
  user_agent,
  CAST(NULL AS VARCHAR) AS ip_address,
  shop_domain,
  customer_id,
  order_id,
  timestamp,
  FROM_UNIXTIME(CAST(timestamp AS BIGINT) / 1000) AS created_at
FROM epir_pixel_events_stream;
