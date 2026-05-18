/**
 * Whitelist `queryId` dla `run_analytics_query` i HTTP `epir-analyst-worker`.
 * Osobny moduł bez szablonów SQL — lekki import w workerach klienckich (np. analyst).
 *
 * `QUERY_BUILDERS` w `analytics-queries.ts` musi definiować każdy identyfikator (typ wymusza spójność).
 *
 * Import z `workers/analyst-worker` przez ścieżkę względną w monorepo:
 * - Plus: jedna lista ID, brak duplikacji, bundel analysta bez szablonów SQL.
 * - Minus: zależność kompilacji między workerami (refaktor ścieżki wymaga zgodności obu projektów);
 *   przy wielu maintainerach rozważ osobny pakiet workspace (`packages/…`); przy jednym — akceptowalne.
 */
export const VALID_QUERY_IDS = [
  'Q1_CONVERSION_CHAT',
  'Q2_CONVERSION_PATHS',
  'Q3_TOP_CHAT_QUESTIONS',
  'Q4_STOREFRONT_SEGMENTATION',
  'Q5_TOP_PRODUCTS',
  'Q6_CHAT_ENGAGEMENT',
  'Q7_PRODUCT_TO_PURCHASE',
  'Q8_DAILY_EVENTS',
  'Q9_TOOL_USAGE',
  'Q10_SESSION_DURATION',
] as const;

export type AnalyticsQueryId = (typeof VALID_QUERY_IDS)[number];
