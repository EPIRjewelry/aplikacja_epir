-- Staging: zdarzenia pixela / analytics worker (EPIR).
-- Źródło: epir-bigquery-batch → epir_pixel_events_raw
select
  event_type,
  session_id,
  customer_id,
  storefront_id,
  channel,
  url,
  payload,
  cast(created_at as timestamp) as created_at
from {{ source('epir_warehouse', 'epir_pixel_events_raw') }}
