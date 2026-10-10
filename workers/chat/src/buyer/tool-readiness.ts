import type { BuyerChannelId } from './channel-switch';
import { buildUcpAgentMeta, resolveUcpAgentProfileUrl } from '../catalog/ucp-agent-meta';
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

function ucpMetaMatchesConversation(env: Env, args: Record<string, unknown>): boolean {
  const required = buildUcpAgentMeta(env);
  const requiredProfile = (required.meta['ucp-agent'] as { profile?: string })?.profile;
  const existingMeta =
    args.meta && typeof args.meta === 'object' ? (args.meta as Record<string, unknown>) : {};
  const existingUcp =
    existingMeta['ucp-agent'] && typeof existingMeta['ucp-agent'] === 'object'
      ? (existingMeta['ucp-agent'] as { profile?: string })
      : {};
  return existingUcp.profile === requiredProfile;
}

async function mcpToolsListOk(shopDomain: string): Promise<{ ok: boolean; status: number }> {
  const url = `https://${shopDomain}/api/mcp`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 'buyer-readiness' }),
    });
    return { ok: res.ok || res.status === 401, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function assessToolReadiness(
  env: Env,
  channelId: BuyerChannelId,
  tool: BuyerToolId,
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
    const ping = await mcpToolsListOk(shop);
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
    const sampleArgs = buildUcpAgentMeta(env);
    if (!ucpMetaMatchesConversation(env, sampleArgs)) {
      return { tool, available: false, reason: 'ucp_agent_profile_mismatch' };
    }
    const ping = await mcpToolsListOk(shop);
    if (!ping.ok) {
      console.warn('[buyer.tool_readiness] cart mcp health failed', { status: ping.status });
      return { tool, available: false, reason: `cart_mcp_unhealthy_${ping.status}` };
    }
    return { tool, available: true, reason: 'ok' };
  }

  if (tool === 'search_shop_policies_and_faqs') {
    const ping = await mcpToolsListOk(shop);
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
