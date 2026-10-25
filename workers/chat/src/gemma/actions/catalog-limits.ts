/**
 * Limit pobrania z UCP przy budżecie słownym (sort po cenie lokalnie).
 * UCP pagination max 250 — https://shopify.dev/docs/agents/catalog/storefront-catalog
 * Czas odpowiedzi MCP przy 250: NIESPRAWDZONE (kalibracja w internal tail).
 */
export const GEMMA_QUALITATIVE_CATALOG_FETCH_LIMIT = 250;

export const GEMMA_CATALOG_DISPLAY_LIMIT = 6;
