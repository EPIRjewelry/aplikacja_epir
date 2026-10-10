import type { BuyerChannelId } from './channel-switch';
import { buildUcpAgentMeta, resolveUcpAgentProfileUrl } from '../catalog/ucp-agent-meta';
import { getUcpCatalogEndpoint } from '../catalog/ucp-catalog-endpoint';
import type { Env } from '../config/bindings';
import { resolveStorefrontConfig } from '../config/storefronts';
import { hasStorefrontCatalogToken } from '../facts/storefront-live';

export type BuyerToolId =
  | 'search_catalog'
  | 'ucp_cart'
  | 'search_shop_policies_and_faqs'
  | 'get_size_table'
  | 'customer_account_profile';

export type ToolReadiness = {
  tool: BuyerToolId;
  available: boolean;
  reason: string;
  /** Customer Accounts: 401 means guest, not infrastructure failure. */
  guestNotLoggedIn?: boolean;
};

export function brandKeyForChannel(channelId: BuyerChannelId): string {
  if (channelId === 'kazka-hydrogen') return 'kazka';
  if (channelId === 'epir-zareczyny') return 'zareczyny';
  return 'online-store';
}

function catalogSnapshotChannel(channelId: BuyerChannelId): BuyerChannelId {
  return channelId === 'kazka-hydrogen' ? 'kazka-hydrogen' : 'epir-online-store';
}

function hasUcpAgentProfile(env: Env): boolean {
  const url = resolveUcpAgentProfileUrl(env);
  return Boolean(url?.trim());
}

function ucpCatalogEndpoint(env: Env, shopDomain: string): string {
  return (
    getUcpCatalogEndpoint(env) ||
    `https://${shopDomain.replace(/\/$/, '')}/api/ucp/mcp`
  );
}

function shopPoliciesMcpEndpoint(shopDomain: string): string {
  return `https://${shopDomain.replace(/\/$/, '')}/api/mcp`;
}

const READINESS_TTL_MS = 5 * 60_000;

type ToolsListCacheEntry = {
  expiresAt: number;
  ok: boolean;
  status: number;
  toolNames: string[];
};

/** In-memory tools/list cache (plan §3) — no KV / Cache API. */
const toolsListCache = new Map<string, ToolsListCacheEntry>();

/** @internal tests */
export function _clearBuyerToolReadinessCache(): void {
  toolsListCache.clear();
}

function parseToolNames(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const result = (payload as { result?: { tools?: unknown } }).result;
  const tools = result?.tools;
  if (!Array.isArray(tools)) return [];
  return tools
    .map((t) =>
      t && typeof t === 'object' && typeof (t as { name?: unknown }).name === 'string'
        ? (t as { name: string }).name.trim()
        : '',
    )
    .filter(Boolean);
}

async function mcpToolsList(
  cacheKey: string,
  url: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; toolNames: string[] }> {
  const cached = toolsListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: cached.ok, status: cached.status, toolNames: cached.toolNames };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) {
      const entry = { expiresAt: Date.now() + READINESS_TTL_MS, ok: false, status: res.status, toolNames: [] as string[] };
      toolsListCache.set(cacheKey, entry);
      return entry;
    }
    let toolNames: string[] = [];
    if (res.ok) {
      const json = await res.json().catch(() => null);
      toolNames = parseToolNames(json);
    }
    const entry = {
      expiresAt: Date.now() + READINESS_TTL_MS,
      ok: res.ok,
      status: res.status,
      toolNames,
    };
    toolsListCache.set(cacheKey, entry);
    return entry;
  } catch {
    return { ok: false, status: 0, toolNames: [] };
  }
}

function ucpToolsListBody(env: Env): Record<string, unknown> {
  const agentMeta = buildUcpAgentMeta(env);
  return {
    jsonrpc: '2.0',
    method: 'tools/list',
    id: 'buyer-readiness',
    params: {
      arguments: {
        meta: agentMeta.meta,
      },
    },
  };
}

function hasAllTools(names: string[], required: string[]): boolean {
  const set = new Set(names);
  return required.every((n) => set.has(n));
}

export type AssessToolReadinessOptions = {
  /** When set, Customer Accounts readiness uses interpretCustomerAccountHttpStatus (401/403 = guest). */
  customerAccountHttpStatus?: number;
};

export async function assessToolReadiness(
  env: Env,
  channelId: BuyerChannelId,
  tool: BuyerToolId,
  opts?: AssessToolReadinessOptions,
): Promise<ToolReadiness> {
  const shop = env.SHOP_DOMAIN?.trim();
  if (!shop) {
    return { tool, available: false, reason: 'missing_shop_domain' };
  }

  if (tool === 'search_catalog') {
    const snap = catalogSnapshotChannel(channelId);
    if (!hasStorefrontCatalogToken(env, snap)) {
      return { tool, available: false, reason: 'missing_storefront_catalog_token' };
    }
    if (!hasUcpAgentProfile(env)) {
      return { tool, available: false, reason: 'missing_ucp_agent_profile' };
    }
    const ping = await mcpToolsList(
      `ucp:${shop}:${channelId}`,
      ucpCatalogEndpoint(env, shop),
      ucpToolsListBody(env),
    );
    if (!ping.ok) {
      console.warn('[buyer.tool_readiness] catalog mcp health failed', { status: ping.status });
      return { tool, available: false, reason: `catalog_mcp_unhealthy_${ping.status}` };
    }
    return { tool, available: true, reason: 'ok' };
  }

  if (tool === 'ucp_cart') {
    if (!hasUcpAgentProfile(env)) {
      return { tool, available: false, reason: 'missing_ucp_agent_profile' };
    }
    const profileUrl = resolveUcpAgentProfileUrl(env);
    const envelopeProfile = buildUcpAgentMeta(env).meta['ucp-agent']?.profile;
    if (!profileUrl?.trim() || profileUrl !== envelopeProfile) {
      return { tool, available: false, reason: 'ucp_agent_profile_mismatch' };
    }
    const ping = await mcpToolsList(
      `ucp:${shop}:${channelId}`,
      ucpCatalogEndpoint(env, shop),
      ucpToolsListBody(env),
    );
    if (!ping.ok) {
      console.warn('[buyer.tool_readiness] cart mcp health failed', { status: ping.status });
      return { tool, available: false, reason: `cart_mcp_unhealthy_${ping.status}` };
    }
    if (!hasAllTools(ping.toolNames, ['create_cart', 'get_cart', 'update_cart'])) {
      return { tool, available: false, reason: 'cart_tools_missing_from_list' };
    }
    return { tool, available: true, reason: 'ok' };
  }

  if (tool === 'search_shop_policies_and_faqs') {
    const ping = await mcpToolsList(`policies:${shop}`, shopPoliciesMcpEndpoint(shop), {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 'buyer-readiness',
    });
    if (!ping.ok) {
      console.warn('[buyer.tool_readiness] policies mcp health failed', { status: ping.status });
      return { tool, available: false, reason: `policies_mcp_unhealthy_${ping.status}` };
    }
    if (!hasAllTools(ping.toolNames, ['search_shop_policies_and_faqs'])) {
      return { tool, available: false, reason: 'policies_tool_missing_from_list' };
    }
    return { tool, available: true, reason: 'ok' };
  }

  if (tool === 'get_size_table') {
    const brand = brandKeyForChannel(channelId);
    const cfg = resolveStorefrontConfig(env, brand);
    const token =
      cfg?.privateToken?.trim() ||
      cfg?.apiToken?.trim() ||
      env.SHOPIFY_STOREFRONT_TOKEN?.trim();
    if (!token) {
      return { tool, available: false, reason: 'missing_storefront_token_size_table' };
    }
    return { tool, available: true, reason: 'ok' };
  }

  if (tool === 'customer_account_profile') {
    const clientId = env.PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID?.trim();
    if (!clientId) {
      return { tool, available: false, reason: 'missing_customer_account_client_id' };
    }
    if (opts?.customerAccountHttpStatus != null) {
      return interpretCustomerAccountHttpStatus(opts.customerAccountHttpStatus);
    }
    return { tool, available: true, reason: 'ok_configured' };
  }

  return { tool, available: false, reason: 'unknown_tool' };
}

/** Tools exposed to the model when readiness passes. */
export async function listAvailableBuyerTools(
  env: Env,
  channelId: BuyerChannelId,
): Promise<BuyerToolId[]> {
  const candidates: BuyerToolId[] = [
    'search_catalog',
    'ucp_cart',
    'search_shop_policies_and_faqs',
    'get_size_table',
    'customer_account_profile',
  ];
  const out: BuyerToolId[] = [];
  for (const tool of candidates) {
    const r = await assessToolReadiness(env, channelId, tool);
    if (r.available) {
      out.push(tool);
    } else {
      console.log(
        JSON.stringify({
          tag: 'buyer.tool_readiness',
          channel_id: channelId,
          tool,
          available: false,
          reason: r.reason,
          guestNotLoggedIn: r.guestNotLoggedIn ?? false,
        }),
      );
    }
  }
  return out;
}

/** Customer Account API 401 on a probe → guest, not outage. */
export function interpretCustomerAccountHttpStatus(status: number): ToolReadiness {
  if (status === 401 || status === 403) {
    return {
      tool: 'customer_account_profile',
      available: false,
      reason: 'customer_not_logged_in',
      guestNotLoggedIn: true,
    };
  }
  if (status >= 500) {
    return {
      tool: 'customer_account_profile',
      available: false,
      reason: `customer_account_unhealthy_${status}`,
    };
  }
  return {
    tool: 'customer_account_profile',
    available: true,
    reason: 'ok',
  };
}
