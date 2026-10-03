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

/** Wymusza meta.ucp-agent.profile na outbound UCP catalog (slim schema nie podaje meta). */
export function ensureUcpAgentMeta(
  args: Record<string, unknown>,
  env: {UCP_AGENT_PROFILE_URL?: string; WORKER_ORIGIN?: string},
): Record<string, unknown> {
  const required = buildUcpAgentMeta(env);
  const existingMeta =
    args.meta && typeof args.meta === 'object' ? (args.meta as Record<string, unknown>) : {};
  const requiredUcp = required.meta['ucp-agent'] as Record<string, unknown>;
  const existingUcp =
    existingMeta['ucp-agent'] && typeof existingMeta['ucp-agent'] === 'object'
      ? (existingMeta['ucp-agent'] as Record<string, unknown>)
      : {};
  return {
    ...args,
    meta: {
      ...existingMeta,
      'ucp-agent': {
        ...existingUcp,
        profile: requiredUcp.profile,
      },
    },
  };
}
