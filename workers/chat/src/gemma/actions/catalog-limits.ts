/**
 * Limit pobrania z UCP przy budżecie słownym (sort po cenie lokalnie).
 * UCP pagination max 250 — https://shopify.dev/docs/agents/catalog/storefront-catalog
 * Czas odpowiedzi MCP przy 250: NIESPRAWDZONE (kalibracja w internal tail).
 */
export const GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT = 250;

/** Karty w reply — bez zmiany vs smoke display. */
export const GEMMA_CATALOG_DISPLAY_LIMIT = 6;

/**
 * UCP fetch gdy PT ∧ metal ∧ stone — top-6 ranking bywa bez dokładnego SKU
 * (S3: target @340 poza top-6 przy query „pierścionek srebro granat”).
 */
export const GEMMA_FACETED_CATALOG_FETCH_LIMIT = 24;
