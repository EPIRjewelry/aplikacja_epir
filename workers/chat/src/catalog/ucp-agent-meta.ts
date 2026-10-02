/**
 * UCP agent profile envelope wymagany przez Storefront Catalog MCP (/api/ucp/mcp).
 * @see https://shopify.dev/docs/agents/catalog/storefront-catalog
 */

/**
 * Fixture Shopify documents as negotiating a full catalog capability set
 * (dev.ucp.shopping.catalog.search + dev.shopify.catalog).
 * @see https://shopify.dev/docs/agents/profiles
 */
export const SHOPIFY_CATALOG_UCP_AGENT_PROFILE =
  'https://shopify.dev/ucp/agent-profiles/2026-08-25/valid-with-capabilities.json';

export function resolveUcpAgentProfileUrl(env: {
  UCP_AGENT_PROFILE_URL?: string;
  WORKER_ORIGIN?: string;
}): string {
  const configured = env.UCP_AGENT_PROFILE_URL?.trim();
  if (configured) return configured;
  // Do not send WORKER_ORIGIN/.well-known/ucp-agent-profile.json.
  // Live retest 2026-10-02: Shopify fetched that URL during search_catalog and
  // answered HTTP 422. The document had no ucp.version and no catalog capabilities,
  // so negotiation failed before any products were returned.
  void env.WORKER_ORIGIN;
  return SHOPIFY_CATALOG_UCP_AGENT_PROFILE;
}

export function buildUcpAgentMeta(env: {
  UCP_AGENT_PROFILE_URL?: string;
  WORKER_ORIGIN?: string;
}): {meta: {'ucp-agent': {profile: string}}} {
  return {
    meta: {
      'ucp-agent': {
        profile: resolveUcpAgentProfileUrl(env),
      },
    },
  };
}

/**
 * Storefront Catalog MCP odrzuca `search_catalog` bez `meta.ucp-agent.profile`
 * (pusty katalog / błąd JSON-RPC, który Gemma czyta jako „nie znaleziono”).
 * Slim schemat narzędzia tego pola nie wystawia, więc worker dokleja profil sam.
 * Istniejący niepusty `profile` od modelu zostaje.
 */
export function ensureUcpAgentMeta(
  args: Record<string, unknown>,
  env: {UCP_AGENT_PROFILE_URL?: string; WORKER_ORIGIN?: string},
): Record<string, unknown> {
  const required = buildUcpAgentMeta(env);
  const existingMeta =
    args.meta && typeof args.meta === 'object' && !Array.isArray(args.meta)
      ? {...(args.meta as Record<string, unknown>)}
      : {};
  const existingAgentRaw = existingMeta['ucp-agent'];
  const existingAgent =
    existingAgentRaw && typeof existingAgentRaw === 'object' && !Array.isArray(existingAgentRaw)
      ? {...(existingAgentRaw as Record<string, unknown>)}
      : {};
  const provided =
    typeof existingAgent.profile === 'string' && existingAgent.profile.trim()
      ? existingAgent.profile.trim()
      : '';
  return {
    ...args,
    meta: {
      ...existingMeta,
      'ucp-agent': {
        ...existingAgent,
        profile: provided || required.meta['ucp-agent'].profile,
      },
    },
  };
}
