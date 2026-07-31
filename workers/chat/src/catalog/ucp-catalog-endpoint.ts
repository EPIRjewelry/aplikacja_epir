/**
 * Endpoint Storefront Catalog MCP (UCP) — discovery layer Spring '26.
 */

export function getUcpCatalogEndpoint(env: {
  UCP_CATALOG_ENDPOINT?: string;
  SHOP_DOMAIN?: string;
}): string {
  const configured = env.UCP_CATALOG_ENDPOINT?.trim();
  if (configured) return configured;
  const domain = env.SHOP_DOMAIN?.trim();
  if (!domain) return '';
  return `https://${domain.replace(/\/$/, '')}/api/ucp/mcp`;
}

/** Narzędzia Gemma routowane na /api/ucp/mcp (discovery). */
export const UCP_CATALOG_TOOL_NAMES = new Set([
  'catalog_search',
  'catalog_lookup',
  'catalog_image_search',
]);

/** Mapowanie nazw narzędzi Gemma → nazwy UCP MCP na endpoincie sklepu. */
export function mapGemmaToolToUcpMcp(toolName: string): string {
  switch (toolName) {
    case 'catalog_search':
    case 'catalog_image_search':
      return 'search_catalog';
    case 'catalog_lookup':
      return 'lookup_catalog';
    default:
      return toolName;
  }
}
