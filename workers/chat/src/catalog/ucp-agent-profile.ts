/**
 * Platform profile served at `/.well-known/ucp-agent-profile.json`.
 * Shape is the 2026-08-25 fixture Shopify can negotiate for Storefront Catalog.
 * A profile without `ucp.version` and catalog capabilities is rejected with HTTP 422.
 * @see https://shopify.dev/docs/agents/profiles
 */
export function buildUcpAgentProfileJson(_env?: {
  WORKER_ORIGIN?: string;
  SHOP_DOMAIN?: string;
}): Record<string, unknown> {
  return {
    ucp: {
      version: '2026-08-25',
      services: {
        'dev.ucp.shopping': [
          {
            version: '2026-08-25',
            spec: 'https://ucp.dev/2026-08-25/specification/overview',
            transport: 'mcp',
            schema: 'https://ucp.dev/2026-08-25/services/shopping/mcp.openrpc.json',
          },
        ],
      },
      capabilities: {
        'dev.ucp.shopping.catalog.search': [
          {
            version: '2026-08-25',
            spec: 'https://ucp.dev/2026-08-25/specification/catalog/search',
            schema: 'https://ucp.dev/2026-08-25/schemas/shopping/catalog_search.json',
          },
        ],
        'dev.ucp.shopping.catalog.lookup': [
          {
            version: '2026-08-25',
            spec: 'https://ucp.dev/2026-08-25/specification/catalog/lookup',
            schema: 'https://ucp.dev/2026-08-25/schemas/shopping/catalog_lookup.json',
          },
        ],
        'dev.shopify.catalog': [
          {
            version: '2026-08-25',
            spec: 'https://shopify.dev/docs/agents/catalog/storefront-catalog',
            schema: 'https://shopify.dev/ucp/schemas/2026-08-25/shopify_catalog.json',
            extends: ['dev.ucp.shopping.catalog.lookup', 'dev.ucp.shopping.catalog.search'],
          },
        ],
      },
      payment_handlers: {},
    },
  };
}
