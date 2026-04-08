/**
 * Whitelist zapytań analitycznych zgodna z kanonicznym kontraktem danych EPIR.
 * queryId musi pochodzić z tej listy – brak surowego SQL od użytkownika.
 */
export const ANALYTICS_QUERY_WHITELIST: Record<string, string> = {
  Q1_CONVERSION_CHAT: `
WITH chat_sessions AS (
  SELECT DISTINCT session_id FROM \`analytics_435783047.messages_raw\` WHERE role = 'user'
),
purchase_sessions AS (
  SELECT DISTINCT session_id FROM \`analytics_435783047.events_raw\`
  WHERE event_type = 'purchase_completed'
)
SELECT 'with_chat' AS segment, COUNT(DISTINCT c.session_id) AS sessions_with_chat, COUNT(DISTINCT p.session_id) AS sessions_with_purchase
FROM chat_sessions c LEFT JOIN purchase_sessions p ON c.session_id = p.session_id
UNION ALL
SELECT 'without_chat',
  (SELECT COUNT(DISTINCT session_id) FROM \`analytics_435783047.events_raw\`) - (SELECT COUNT(*) FROM chat_sessions),
  (SELECT COUNT(DISTINCT session_id) FROM purchase_sessions) - (SELECT COUNT(DISTINCT c.session_id) FROM chat_sessions c JOIN purchase_sessions p ON c.session_id = p.session_id)
`,
  Q2_CONVERSION_PATHS: `
SELECT event_type, COUNT(*) AS event_count, COUNT(DISTINCT session_id) AS unique_sessions
FROM \`analytics_435783047.events_raw\`
WHERE event_type IN ('page_viewed', 'product_viewed', 'product_added_to_cart', 'cart_updated', 'purchase_completed')
  AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY event_type
ORDER BY CASE event_type WHEN 'page_viewed' THEN 1 WHEN 'product_viewed' THEN 2 WHEN 'product_added_to_cart' THEN 3 WHEN 'cart_updated' THEN 4 WHEN 'purchase_completed' THEN 5 ELSE 6 END
`,
  Q3_TOP_CHAT_QUESTIONS: `
SELECT content, COUNT(*) AS occurrence_count
FROM \`analytics_435783047.messages_raw\`
WHERE role = 'user' AND LENGTH(TRIM(content)) > 5
  AND timestamp >= UNIX_MILLIS(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY))
GROUP BY content ORDER BY occurrence_count DESC LIMIT 20
`,
  Q4_STOREFRONT_SEGMENTATION: `
SELECT CASE WHEN url LIKE '%kazka%' THEN 'kazka' WHEN url LIKE '%zareczyny%' THEN 'zareczyny' ELSE 'online-store' END AS storefront_inferred,
  event_type, COUNT(*) AS event_count
FROM \`analytics_435783047.events_raw\`
WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY storefront_inferred, event_type ORDER BY storefront_inferred, event_count DESC
`,
  Q5_TOP_PRODUCTS: `
SELECT JSON_VALUE(payload, '$.product_id') AS product_id, JSON_VALUE(payload, '$.product_title') AS product_title, COUNT(*) AS view_count
FROM \`analytics_435783047.events_raw\`
WHERE event_type = 'product_viewed' AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY product_id, product_title ORDER BY view_count DESC LIMIT 20
`,
  Q6_CHAT_ENGAGEMENT: `
SELECT session_id, COUNT(*) AS message_count, COUNTIF(role = 'user') AS user_messages, COUNTIF(role = 'assistant') AS assistant_messages
FROM \`analytics_435783047.messages_raw\`
WHERE timestamp >= UNIX_MILLIS(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY))
GROUP BY session_id ORDER BY message_count DESC LIMIT 50
`,
  Q7_PRODUCT_TO_PURCHASE: `
WITH product_sessions AS (SELECT DISTINCT session_id FROM \`analytics_435783047.events_raw\` WHERE event_type = 'product_viewed'),
purchase_sessions AS (SELECT DISTINCT session_id FROM \`analytics_435783047.events_raw\` WHERE event_type = 'purchase_completed')
SELECT COUNT(DISTINCT p.session_id) AS product_view_sessions, COUNT(DISTINCT pur.session_id) AS purchase_sessions,
  ROUND(100.0 * COUNT(DISTINCT pur.session_id) / NULLIF(COUNT(DISTINCT p.session_id), 0), 2) AS conversion_rate_pct
FROM product_sessions p LEFT JOIN purchase_sessions pur ON p.session_id = pur.session_id
`,
  Q8_DAILY_EVENTS: `
SELECT DATE(created_at) AS event_date, event_type, COUNT(*) AS event_count
FROM \`analytics_435783047.events_raw\`
WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY event_date, event_type ORDER BY event_date DESC, event_count DESC
`,
  Q9_TOOL_USAGE: `
SELECT name AS tool_name, COUNT(*) AS call_count
FROM \`analytics_435783047.messages_raw\`
WHERE role = 'tool' AND name IS NOT NULL
  AND timestamp >= UNIX_MILLIS(TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY))
GROUP BY name ORDER BY call_count DESC
`,
  Q10_SESSION_DURATION: `
SELECT session_id, MIN(created_at) AS first_event, MAX(created_at) AS last_event,
  TIMESTAMP_DIFF(MAX(created_at), MIN(created_at), SECOND) AS duration_seconds
FROM \`analytics_435783047.events_raw\`
WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY session_id HAVING duration_seconds > 0 ORDER BY duration_seconds DESC LIMIT 100
`,
};

export const VALID_QUERY_IDS = Object.keys(ANALYTICS_QUERY_WHITELIST);
