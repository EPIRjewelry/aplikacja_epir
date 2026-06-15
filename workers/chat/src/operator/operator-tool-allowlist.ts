/**
 * Narzędzia dostępne wyłącznie na kanale `operator` (nie Gemma).
 */
import {
  DEFAULT_OPERATOR_ROLE_ID,
  getOperatorRole,
  type OperatorRoleId,
} from './operator-roles';

type ToolSchemaLike = { readonly name: string };

/** Narzędzia wewnętrzne Project B (nie przez Storefront MCP buyer). */
export const OPERATOR_INTERNAL_TOOL_NAMES = new Set([
  'run_analytics_query',
  'fetch_marketing_preview',
  'run_shopify_shopifyql',
  'blender_bridge_invoke',
  'operator_shopify_admin_read',
]);

/** Odczyt sklepu — do analizy/operacji operatora, bez koszyka. */
export const OPERATOR_READONLY_COMMERCE_TOOL_NAMES = new Set([
  'search_catalog',
  'search_shop_policies_and_faqs',
]);

/** Wykluczone z operatora (buyer-facing Gemma). */
export const OPERATOR_EXCLUDED_TOOL_NAMES = new Set([
  'get_cart',
  'update_cart',
  'get_size_table',
]);

export const OPERATOR_TOOL_ALLOWLIST = new Set([
  ...OPERATOR_INTERNAL_TOOL_NAMES,
  ...OPERATOR_READONLY_COMMERCE_TOOL_NAMES,
]);

export function getOperatorToolsForRole(roleId: OperatorRoleId | null | undefined): Set<string> {
  const role = getOperatorRole(roleId ?? DEFAULT_OPERATOR_ROLE_ID);
  return new Set(role?.toolNames ?? []);
}

export function isOperatorToolAllowedForRole(toolName: string, roleId: OperatorRoleId): boolean {
  return getOperatorToolsForRole(roleId).has(toolName);
}

export function filterToolSchemasForOperator<T extends ToolSchemaLike>(
  schemas: Record<string, T>,
  roleId: OperatorRoleId = DEFAULT_OPERATOR_ROLE_ID,
): T[] {
  const allowed = getOperatorToolsForRole(roleId);
  return Object.values(schemas).filter(
    (s) => OPERATOR_TOOL_ALLOWLIST.has(s.name) && allowed.has(s.name),
  );
}

export function isOperatorExcludedTool(name: string): boolean {
  return OPERATOR_EXCLUDED_TOOL_NAMES.has(name);
}
