/**
 * UCP agent profile envelope wymagany przez Storefront Catalog MCP (/api/ucp/mcp).
 * @see https://shopify.dev/docs/agents/catalog/storefront-catalog
 */

const DEFAULT_UCP_AGENT_PROFILE =
  'https://shopify.dev/ucp/agent-profiles/examples/2026-04-08/valid-with-capabilities.json';

export function resolveUcpAgentProfileUrl(env: {
  UCP_AGENT_PROFILE_URL?: string;
  WORKER_ORIGIN?: string;
}): string {
  const configured = env.UCP_AGENT_PROFILE_URL?.trim();
  if (configured) return configured;
  const origin = env.WORKER_ORIGIN?.trim().replace(/\/$/, '');
  if (origin) {
    return `${origin}/.well-known/ucp-agent-profile.json`;
  }
  return DEFAULT_UCP_AGENT_PROFILE;
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
