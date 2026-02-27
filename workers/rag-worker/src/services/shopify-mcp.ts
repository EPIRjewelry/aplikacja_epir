/**
 * RAG Worker - Service: Shopify MCP Client
 * 
 * Handles all communication with Shopify Merchant Component Platform (MCP).
 * Uses JSON-RPC 2.0 protocol as per MCP specification.
 * 
 * NO API KEY REQUIRED - MCP is a public endpoint for the shop.
 * 
 * @see Harmony Chat_ Shopify, MCP, API, UX.txt - Section III
 * @see workers/worker/src/rag.ts - callMcpTool function
 */

import { MCP_RETRY_CONFIG, MCP_TOOLS } from '../config/sources';
import { isString, isRecord } from '../utils/json';
import { callMcpWithRetry, extractMcpTextContent } from '../utils/mcp-client';

/**
 * Call Shopify MCP tool with retry logic
 * 
 * @param mcpEndpoint - URL z env.CANONICAL_MCP_URL (wrangler.toml [vars])
 * @param toolName - Name of MCP tool (use MCP_TOOLS constants)
 * @param args - Tool arguments
 * @returns Parsed result or null on error
 * 
 * @example
 * ```typescript
 * const products = await callShopifyMcp(env.CANONICAL_MCP_URL!, MCP_TOOLS.SEARCH_CATALOG, {
 *   query: 'pierścionki',
 *   context: 'biżuteria'
 * });
 * ```
 */
export async function callShopifyMcp(
  mcpEndpoint: string,
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  return callMcpWithRetry(mcpEndpoint, toolName, args, MCP_RETRY_CONFIG);
}

/**
 * Search product catalog via MCP
 */
export async function searchProducts(
  mcpEndpoint: string,
  query: string,
  context: string = 'biżuteria'
): Promise<string> {
  const result = await callShopifyMcp(mcpEndpoint, MCP_TOOLS.SEARCH_CATALOG, {
    query,
    context,
  });

  return extractMcpTextContent(result);
}

/**
 * Get cart via MCP
 */
export async function getCart(mcpEndpoint: string, cartId: string): Promise<any> {
  return callShopifyMcp(mcpEndpoint, MCP_TOOLS.GET_CART, { cart_id: cartId });
}

/**
 * Update cart via MCP
 */
export async function updateCart(mcpEndpoint: string, cartId: string, items: any[]): Promise<any> {
  return callShopifyMcp(mcpEndpoint, MCP_TOOLS.UPDATE_CART, { cart_id: cartId, items });
}

/**
 * Get most recent order status via MCP
 */
export async function getMostRecentOrder(mcpEndpoint: string): Promise<any> {
  return callShopifyMcp(mcpEndpoint, MCP_TOOLS.GET_RECENT_ORDER, {});
}

/**
 * Search policies and FAQs via MCP
 */
export async function searchPoliciesFaq(mcpEndpoint: string, query: string): Promise<any> {
  return callShopifyMcp(mcpEndpoint, MCP_TOOLS.SEARCH_POLICIES_FAQ, { query });
}
