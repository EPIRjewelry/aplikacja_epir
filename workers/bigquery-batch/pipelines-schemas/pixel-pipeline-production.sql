-- Prod SQL: 13 columns = epir_pixel_events_sink (analytics.epir_pixel_events_raw)
-- Stream: session_id, event_type, timestamp (ms), page_url, referrer, utm_*, user_agent, shop_domain

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
  timestamp,
  created_at
)
SELECT
  0 AS id,
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
  timestamp,
  FROM_UNIXTIME(CAST(timestamp AS BIGINT) / 1000) AS created_at
FROM epir_pixel_events_stream;
