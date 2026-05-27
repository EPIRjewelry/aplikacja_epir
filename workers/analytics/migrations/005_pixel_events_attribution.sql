-- Attribution columns for traffic source identification.
ALTER TABLE pixel_events ADD COLUMN traffic_source TEXT;
ALTER TABLE pixel_events ADD COLUMN traffic_medium TEXT;
ALTER TABLE pixel_events ADD COLUMN traffic_campaign TEXT;
ALTER TABLE pixel_events ADD COLUMN traffic_content TEXT;
ALTER TABLE pixel_events ADD COLUMN traffic_term TEXT;
ALTER TABLE pixel_events ADD COLUMN click_id TEXT;
ALTER TABLE pixel_events ADD COLUMN click_id_type TEXT;

CREATE INDEX IF NOT EXISTS idx_pixel_traffic_source
  ON pixel_events(traffic_source, traffic_medium, created_at);

CREATE INDEX IF NOT EXISTS idx_pixel_click_id
  ON pixel_events(click_id, created_at)
  WHERE click_id IS NOT NULL;
