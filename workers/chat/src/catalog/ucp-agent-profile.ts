/**
 * Platform profile at `/.well-known/ucp-agent-profile.json`.
 * Shopify negotiates `ucp.version` (YYYY-MM-DD). A flat `version` is reported as
 * "Missing ucp version" (version_unsupported) before catalog search runs.
 * The shop advertises UCP 2026-08-25. Identity stays at the root: the profile
 * schema allows additional properties, and non-protocol fields do not belong inside `ucp`.
 * @see https://shopify.dev/docs/agents/profiles
 * @see https://ucp.dev/2026-08-25/specification/overview/
 */

const UCP_VERSION = '2026-08-25';

type CapabilityDeclaration = {
  version: typeof UCP_VERSION;
  spec: string;
  schema: string;
  extends?: string[];
};

function capability(spec: string, schema: string, parents?: string[]): CapabilityDeclaration[] {
  const entry: CapabilityDeclaration = {version: UCP_VERSION, spec, schema};
  if (parents?.length) entry.extends = parents;
  return [entry];
}

export function buildUcpAgentProfileJson(env: {
  WORKER_ORIGIN?: string;
  SHOP_DOMAIN?: string;
}): Record<string, unknown> {
  const origin = env.WORKER_ORIGIN?.trim().replace(/\/$/, '') || 'https://asystent.epirbizuteria.pl';
  const shop = env.SHOP_DOMAIN?.trim() || 'epir-art-silver-jewellery.myshopify.com';
  return {
    name: 'EPIR Gemma',
    description: 'Luxury jewelry assistant for EPIR Art Jewellery storefronts.',
    url: origin,
    merchant: {shop_domain: shop},
    ucp: {
      version: UCP_VERSION,
      services: {
        'dev.ucp.shopping': [
          {
            version: UCP_VERSION,
            spec: 'https://ucp.dev/2026-08-25/specification/overview',
            transport: 'mcp',
            schema: 'https://ucp.dev/2026-08-25/services/shopping/mcp.openrpc.json',
          },
        ],
      },
      capabilities: {
        'dev.ucp.shopping.catalog.search': capability(
          'https://ucp.dev/2026-08-25/specification/catalog/search',
          'https://ucp.dev/2026-08-25/schemas/shopping/catalog_search.json',
        ),
        'dev.ucp.shopping.catalog.lookup': capability(
          'https://ucp.dev/2026-08-25/specification/catalog/lookup',
          'https://ucp.dev/2026-08-25/schemas/shopping/catalog_lookup.json',
        ),
        'dev.shopify.catalog': capability(
          'https://shopify.dev/docs/agents/catalog/storefront-catalog',
          'https://shopify.dev/ucp/schemas/2026-08-25/shopify_catalog.json',
          ['dev.ucp.shopping.catalog.lookup', 'dev.ucp.shopping.catalog.search'],
        ),
        'dev.ucp.shopping.cart': capability(
          'https://ucp.dev/2026-08-25/specification/cart',
          'https://ucp.dev/2026-08-25/schemas/shopping/cart.json',
        ),
        'dev.ucp.shopping.checkout': capability(
          'https://ucp.dev/2026-08-25/specification/shopping/checkout',
          'https://ucp.dev/2026-08-25/schemas/shopping/checkout.json',
        ),
      },
      payment_handlers: {},
    },
  };
}
