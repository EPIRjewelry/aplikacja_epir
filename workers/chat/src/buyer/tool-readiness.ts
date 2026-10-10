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

function brandKeyForChannel(channelId: BuyerChannelId): string {
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

async function mcpToolsListOk(
  url: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // UCP catalog/cart and shop policies: 401/403 mean the tool is unavailable
    // (not “guest”). Guest semantics apply only to Customer Accounts via
    // interpretCustomerAccountHttpStatus.
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status };
    }
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
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
    const ping = await mcpToolsListOk(
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
    const ping = await mcpToolsListOk(
      ucpCatalogEndpoint(env, shop),
      ucpToolsListBody(env),
    );
    if (!ping.ok) {
      console.warn('[buyer.tool_readiness] cart mcp health failed', { status: ping.status });
      return { tool, available: false, reason: `cart_mcp_unhealthy_${ping.status}` };
    }
    return { tool, available: true, reason: 'ok' };
  }

  if (tool === 'search_shop_policies_and_faqs') {
    const ping = await mcpToolsListOk(shopPoliciesMcpEndpoint(shop), {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 'buyer-readiness',
    });
    if (!ping.ok) {
      console.warn('[buyer.tool_readiness] policies mcp health failed', { status: ping.status });
      return { tool, available: false, reason: `policies_mcp_unhealthy_${ping.status}` };
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
