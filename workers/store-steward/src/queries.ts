/**
 * Mapowanie zapytań analitycznych Store Steward (Faza 0).
 * D1: aggregate-d1.ts (pixel_events, okno lookback).
 * R2 SQL: whitelist w epir-bigquery-batch (analytics-queries.ts).
 */

export const D1_METRICS = [
  'funnel_global — event_type counts + unique_sessions',
  'product_* — view_to_atc_rate, avg scroll/time (top 30 products by views)',
  'channel_* — session_count per channel + storefront_id',
  'checkout_global — checkout_abandon_rate',
] as const;

export const R2_SQL_PHASE0 = {
  Q2_CONVERSION_PATHS: 'Lejek zdarzeń: page_viewed → product_viewed → ATC → cart → purchase',
  Q4_STOREFRONT_SEGMENTATION: 'Segmentacja storefront (kazka / zareczyny / online-store)',
  Q5_TOP_PRODUCTS: 'Top product_viewed (30 dni)',
  Q7_PRODUCT_TO_PURCHASE: 'Konwersja view → purchase per produkt',
  Q8_DAILY_EVENTS: 'Dzienny wolumen event_type',
} as const;

export const R2_SQL_DEFERRED = {
  Q1_CONVERSION_CHAT: 'Czat vs zakup — Project B / osobna interpretacja',
  Q3_TOP_CHAT_QUESTIONS: 'Wymaga messages_raw',
  Q6_CHAT_ENGAGEMENT: 'Wymaga messages_raw',
  Q9_TOOL_USAGE: 'Wymaga messages_raw',
  Q10_SESSION_DURATION: 'Długość sesji pixel — opcjonalnie Faza 0.5',
} as const;
