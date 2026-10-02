/**
 * Static UCP agent profile for Storefront Catalog MCP discovery.
 * @see https://shopify.dev/docs/agents/catalog/storefront-catalog
 */
export function buildUcpAgentProfileJson(env: {
  WORKER_ORIGIN?: string;
  SHOP_DOMAIN?: string;
}): Record<string, unknown> {
  const origin = env.WORKER_ORIGIN?.trim().replace(/\/$/, '') ?? 'https://asystent.epirbizuteria.pl';
  const shop = env.SHOP_DOMAIN?.trim() ?? 'epir-art-silver-jewellery.myshopify.com';
  return {
    name: 'EPIR Gemma',
    description: 'Luxury jewelry assistant for EPIR Art Jewellery storefronts.',
    url: origin,
    merchant: {shop_domain: shop},
    capabilities: ['catalog_search', 'catalog_lookup', 'cart', 'checkout'],
    version: '2026-04',
  };
}
