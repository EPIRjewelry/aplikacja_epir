/**
 * SQL wyrażenia HAM — resolved_* bez mutacji raw pixel_events.
 */

/** Ostatni event sesji (proxy last touch w oknie sesji). */
export const SESSION_LATEST_SUBQUERY = `
  SELECT session_id, MAX(CAST(id AS INTEGER)) AS max_id
  FROM pixel_events
  WHERE session_id IS NOT NULL
  GROUP BY session_id`;

export const RESOLVED_SOURCE_EXPR = `
  COALESCE(
    NULLIF(LOWER(TRIM(pe.traffic_source)), ''),
    CASE pe.click_id_type
      WHEN 'gclid' THEN 'google'
      WHEN 'fbclid' THEN 'facebook'
      WHEN 'msclkid' THEN 'bing'
      WHEN 'ttclid' THEN 'tiktok'
    END,
    NULLIF(LOWER(TRIM(pe.channel)), ''),
    'unknown'
  )`;

export const RESOLVED_MEDIUM_EXPR = `
  COALESCE(
    NULLIF(LOWER(TRIM(pe.traffic_medium)), ''),
    CASE pe.click_id_type
      WHEN 'gclid' THEN 'cpc'
      WHEN 'fbclid' THEN 'cpc'
      WHEN 'msclkid' THEN 'cpc'
      WHEN 'ttclid' THEN 'cpc'
    END,
    'unknown'
  )`;

export const RESOLVED_CAMPAIGN_EXPR = `NULLIF(LOWER(TRIM(pe.traffic_campaign)), '')`;

export const TIME_FILTER_PLACEHOLDER = `(typeof(created_at) = 'integer' AND created_at >= ?1)
  OR (typeof(created_at) = 'text' AND created_at >= datetime(?1 / 1000.0, 'unixepoch'))`;
