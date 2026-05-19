/**
 * Whitelist zapytań analitycznych (run_analytics_query) — silnik **R2 SQL** nad tabelami Iceberg
 * w R2 Data Catalog (ten sam magazyn co Pipelines / `epir-analityc-worker` CQRS).
 *
 * **Kontrakt odczytu (prod):** tabela pixel (np. `analytics.epir_pixel_events_raw`) ma układ
 * spłaszczony z D1 / pipeline (m.in. `page_url`, `referrer_url`, `session_id`, `event_type`,
 * `created_at`; opcjonalnie `product_id` / `product_title` gdy pipeline je mapuje) — **bez**
 * kolumn stream ingest `url` / `payload`. SQL poniżej
 * odwołuje się wyłącznie do kolumn Iceberg; mapowanie HTTP ingest → Iceberg jest w Pipelines
 * (Dashboard), nie w tym pliku.
 *
 * **R2 SQL:** brak `SELECT DISTINCT` i `COUNT(DISTINCT …)` — używaj `GROUP BY` oraz
 * `approx_distinct()` (jak w `workers/analytics/src/cqrs/r2-warehouse-query.ts`).
 *
 * queryId musi pochodzić z listy — brak surowego SQL od użytkownika.
 */

import { assertSqlIdentifier } from './sql-identifiers';
import type { AnalyticsQueryId } from './analytics-query-ids';

export { VALID_QUERY_IDS, type AnalyticsQueryId } from './analytics-query-ids';

export interface WarehouseTableEnv {
  WAREHOUSE_SQL_NAMESPACE?: string;
  /** Tabela zdarzeń pixel w Iceberg (np. epir_pixel_events_raw). */
  WAREHOUSE_SQL_PIXEL_TABLE?: string;
  /** Tabela wiadomości czatu w Iceberg (np. messages_raw). */
  WAREHOUSE_SQL_MESSAGES_TABLE?: string;
}

function fqTables(env: WarehouseTableEnv): { pixel: string; messages: string } {
  const ns = assertSqlIdentifier((env.WAREHOUSE_SQL_NAMESPACE ?? 'analytics').trim(), 'namespace');
  const pt = assertSqlIdentifier((env.WAREHOUSE_SQL_PIXEL_TABLE ?? 'epir_pixel_events_raw').trim(), 'pixel table');
  const mt = assertSqlIdentifier((env.WAREHOUSE_SQL_MESSAGES_TABLE ?? 'messages_raw').trim(), 'messages table');
  return { pixel: `${ns}.${pt}`, messages: `${ns}.${mt}` };
}

const QUERY_BUILDERS: Record<AnalyticsQueryId, (P: string, M: string) => string> = {
  Q1_CONVERSION_CHAT: (P, M) => `
WITH chat_sessions AS (
  SELECT session_id FROM ${M} WHERE role = 'user' GROUP BY session_id
),
purchase_sessions AS (
  SELECT session_id FROM ${P} WHERE event_type = 'purchase_completed' GROUP BY session_id
),
chat_with_purchase AS (
  SELECT c.session_id
  FROM chat_sessions c
  INNER JOIN purchase_sessions p ON c.session_id = p.session_id
)
SELECT 'with_chat' AS segment,
  (SELECT approx_distinct(session_id) FROM chat_sessions) AS sessions_with_chat,
  (SELECT approx_distinct(session_id) FROM chat_with_purchase) AS sessions_with_purchase
UNION ALL
SELECT 'without_chat' AS segment,
  (SELECT approx_distinct(session_id) FROM ${P}) - (SELECT approx_distinct(session_id) FROM chat_sessions),
  (SELECT approx_distinct(session_id) FROM purchase_sessions) - (SELECT approx_distinct(session_id) FROM chat_with_purchase)
`,

  Q2_CONVERSION_PATHS: (P) => `
SELECT event_type, COUNT(*) AS event_count, approx_distinct(session_id) AS unique_sessions
FROM ${P}
WHERE event_type IN ('page_viewed', 'product_viewed', 'product_added_to_cart', 'cart_updated', 'purchase_completed')
  AND CAST(created_at AS TIMESTAMP) >= now() - INTERVAL '30' DAY
GROUP BY event_type
ORDER BY CASE event_type WHEN 'page_viewed' THEN 1 WHEN 'product_viewed' THEN 2 WHEN 'product_added_to_cart' THEN 3 WHEN 'cart_updated' THEN 4 WHEN 'purchase_completed' THEN 5 ELSE 6 END
`,

  Q3_TOP_CHAT_QUESTIONS: (_, M) => `
SELECT content, COUNT(*) AS occurrence_count
FROM ${M}
WHERE role = 'user' AND length(trim(COALESCE(content, ''))) > 5
  AND "timestamp" >= (CAST(to_unixtime(now() - INTERVAL '30' DAY) AS BIGINT) * 1000)
GROUP BY content ORDER BY occurrence_count DESC LIMIT 20
`,

  Q4_STOREFRONT_SEGMENTATION: (P) => `
SELECT CASE
  WHEN page_url LIKE '%kazka%' THEN 'kazka'
  WHEN page_url LIKE '%zareczyny%' THEN 'zareczyny'
  ELSE 'online-store'
END AS storefront_inferred,
  event_type, COUNT(*) AS event_count
FROM ${P}
WHERE CAST(created_at AS TIMESTAMP) >= now() - INTERVAL '30' DAY
GROUP BY CASE
  WHEN page_url LIKE '%kazka%' THEN 'kazka'
  WHEN page_url LIKE '%zareczyny%' THEN 'zareczyny'
  ELSE 'online-store'
END, event_type
ORDER BY storefront_inferred, event_count DESC
`,

  Q5_TOP_PRODUCTS: (P) => `
SELECT
  page_url AS product_id,
  page_url AS product_title,
  COUNT(*) AS view_count
FROM ${P}
WHERE event_type = 'product_viewed'
  AND CAST(created_at AS TIMESTAMP) >= now() - INTERVAL '30' DAY
  AND COALESCE(NULLIF(trim(page_url), ''), '') <> ''
GROUP BY page_url
ORDER BY view_count DESC
LIMIT 20
`,

  Q6_CHAT_ENGAGEMENT: (_, M) => `
SELECT session_id, COUNT(*) AS message_count,
  SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS user_messages,
  SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) AS assistant_messages
FROM ${M}
WHERE "timestamp" >= (CAST(to_unixtime(now() - INTERVAL '30' DAY) AS BIGINT) * 1000)
GROUP BY session_id ORDER BY message_count DESC LIMIT 50
`,

  Q7_PRODUCT_TO_PURCHASE: (P) => `
WITH product_sessions AS (
  SELECT session_id FROM ${P} WHERE event_type = 'product_viewed' GROUP BY session_id
),
purchase_sessions AS (
  SELECT session_id FROM ${P} WHERE event_type = 'purchase_completed' GROUP BY session_id
),
product_with_purchase AS (
  SELECT p.session_id
  FROM product_sessions p
  INNER JOIN purchase_sessions pur ON p.session_id = pur.session_id
)
SELECT
  (SELECT approx_distinct(session_id) FROM product_sessions) AS product_view_sessions,
  (SELECT approx_distinct(session_id) FROM purchase_sessions) AS purchase_sessions,
  ROUND(
    100.0 * (SELECT approx_distinct(session_id) FROM product_with_purchase)
      / NULLIF((SELECT approx_distinct(session_id) FROM product_sessions), 0),
    2
  ) AS conversion_rate_pct
`,

  Q8_DAILY_EVENTS: (P) => `
SELECT CAST(date_trunc('day', CAST(created_at AS TIMESTAMP)) AS DATE) AS event_date, event_type, COUNT(*) AS event_count
FROM ${P}
WHERE CAST(created_at AS TIMESTAMP) >= now() - INTERVAL '30' DAY
GROUP BY CAST(date_trunc('day', CAST(created_at AS TIMESTAMP)) AS DATE), event_type ORDER BY event_date DESC, event_count DESC
`,

  Q9_TOOL_USAGE: (_, M) => `
SELECT name AS tool_name, COUNT(*) AS call_count
FROM ${M}
WHERE role = 'tool' AND name IS NOT NULL
  AND "timestamp" >= (CAST(to_unixtime(now() - INTERVAL '30' DAY) AS BIGINT) * 1000)
GROUP BY name ORDER BY call_count DESC
`,

  Q10_SESSION_DURATION: (P) => `
SELECT session_id,
  min_ts AS first_event,
  max_ts AS last_event,
  CAST(date_part('epoch', max_ts - min_ts) AS BIGINT) AS duration_seconds
FROM (
  SELECT session_id,
    MIN(CAST(created_at AS TIMESTAMP)) AS min_ts,
    MAX(CAST(created_at AS TIMESTAMP)) AS max_ts
  FROM ${P}
  WHERE CAST(created_at AS TIMESTAMP) >= now() - INTERVAL '30' DAY
  GROUP BY session_id
) s
WHERE date_part('epoch', max_ts - min_ts) > 0
ORDER BY duration_seconds DESC
LIMIT 100
`,
};

export function getR2AnalyticsSql(env: WarehouseTableEnv, queryId: string): string | undefined {
  const builder = QUERY_BUILDERS[queryId];
  if (!builder) return undefined;
  const { pixel, messages } = fqTables(env);
  return builder(pixel, messages).trim();
}
