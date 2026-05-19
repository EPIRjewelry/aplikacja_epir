-- Example: Pipelines SQL stream → Iceberg sink (pixel).
-- Copy/adapt in Cloudflare Dashboard or `wrangler pipelines create --sql "..."`.
-- MUST stay aligned with docs/EPIR_ANALYTICS_DATA_CONTRACT.md (section 3–4).
-- Stream columns: event_type, session_id, customer_id, storefront_id, channel, url, payload, created_at
-- Target table: analytics.epir_pixel_events_raw (R2 Data Catalog sink)

INSERT INTO epir_pixel_events_sink
SELECT
  event_type,
  session_id,
  customer_id,
  storefront_id,
  channel,
  url AS page_url,
  CAST(json_extract_scalar(payload, '$.referrer') AS VARCHAR) AS referrer_url,
  CAST(json_extract_scalar(payload, '$.id') AS VARCHAR) AS id,
  created_at
FROM epir_pixel_events_stream;
