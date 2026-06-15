/**
 * Operator Studio v2 — 4 role (zamiast 14 trybów × 7 agentów).
 */
import { BLENDER_BRIDGE_TOOL_NAMES } from '../blender-bridge-tool-catalog';

export type OperatorRoleId = 'analyst' | 'store_ops' | 'design_blender' | 'creative';

export type OperatorRole = {
  readonly id: OperatorRoleId;
  readonly label: string;
  readonly description: string;
  readonly toolNames: readonly string[];
  readonly systemAddon: string;
};

export const OPERATOR_ROLES: readonly OperatorRole[] = [
  {
    id: 'analyst',
    label: 'Analityk',
    description: 'Hurtownia, GA4/Ads, ShopifyQL, raporty, EDOG.',
    toolNames: [
      'run_analytics_query',
      'fetch_marketing_preview',
      'run_shopify_shopifyql',
      'search_catalog',
      'search_shop_policies_and_faqs',
    ],
    systemAddon: `
TRYB: Analityk operacyjny EPIR.
- Priorytet: run_analytics_query, fetch_marketing_preview, run_shopify_shopifyql.
- Cytuj source w JSON; przy FAIL EDOG opisz warstwy przed interpretacją liczb.
- Nie generuj obrazów, packshotów Blender ani copy reklamowego w tym trybie.
`.trim(),
  },
  {
    id: 'store_ops',
    label: 'Operacje sklepu',
    description: 'Katalog, polityki, Admin read, steward.',
    toolNames: [
      'search_catalog',
      'search_shop_policies_and_faqs',
      'operator_shopify_admin_read',
      'run_shopify_shopifyql',
    ],
    systemAddon: `
TRYB: Operacje sklepu Shopify (operator).
- Odczyt: search_catalog, search_shop_policies_and_faqs, operator_shopify_admin_read.
- Analityka: run_shopify_shopifyql gdy potrzebne.
- Nie używaj koszyka (get_cart/update_cart). Nie publikuj mutacji bez potwierdzenia operatora.
`.trim(),
  },
  {
    id: 'design_blender',
    label: 'Blender / CAD',
    description: 'Most HTTP, packshot, mesh, STL.',
    toolNames: ['blender_bridge_invoke'],
    systemAddon: `
TRYB: Blender / CAD (metryczne mm, biżuteria).
- „Model 3D” = mesh/scena w Blenderze na PC — NIE produkt ani SKU w Shopify.
- Pierwszy krok: blender_bridge_invoke(blender_ping).
- tool_name: wybieraj WYŁĄCZNIE z enum (${BLENDER_BRIDGE_TOOL_NAMES.length} narzędzi). Krzywe/obrysy: curve_cutter_create.
- Zablokowane: run_script, node_tool_invoke.
- ZAKAZ: run_analytics_query, run_shopify_shopifyql, search_catalog — w tej roli nie istnieją.
- Most offline → Start MCP Bridge w Blenderze; nie proponuj ShopifyQL ani Q5.
- Nie zmyślaj metrics/renderu — tylko wynik z mostu.
`.trim(),
  },
  {
    id: 'creative',
    label: 'Kreacja',
    description: 'Pełny katalog OpenRouter — tekst, obraz, multimodal.',
    toolNames: [],
    systemAddon: `
TRYB: Kreacja (copy, obrazy, briefy wizualne).
- Wybierz model z katalogu OpenRouter (tekst lub image).
- Dostarcz assety i copy do ręcznego wdrożenia — bez auto-publikacji do Shopify.
- Bez narzędzi warehouse/Shopify/Blender — tylko generacja w modelu.
`.trim(),
  },
] as const;

const ROLE_BY_ID = new Map(OPERATOR_ROLES.map((r) => [r.id, r]));

export const DEFAULT_OPERATOR_ROLE_ID: OperatorRoleId = 'analyst';

export function isOperatorRoleId(value: string): value is OperatorRoleId {
  return ROLE_BY_ID.has(value as OperatorRoleId);
}

export function getOperatorRole(id: string | null | undefined): OperatorRole | null {
  if (!id?.trim()) return null;
  return ROLE_BY_ID.get(id.trim() as OperatorRoleId) ?? null;
}

export function resolveOperatorRoleIdFromHeaders(
  headers: { get(name: string): string | null },
): OperatorRoleId {
  const raw =
    headers.get('x-epir-operator-role')?.trim() ??
    headers.get('X-EPIR-OPERATOR-ROLE')?.trim() ??
    '';
  return isOperatorRoleId(raw) ? raw : DEFAULT_OPERATOR_ROLE_ID;
}

export function resolveOperatorRoleAddonFromHeaders(
  headers: { get(name: string): string | null },
): string {
  return getOperatorRole(resolveOperatorRoleIdFromHeaders(headers))?.systemAddon ?? '';
}

export function operatorRolesJson(): string {
  return JSON.stringify(
    OPERATOR_ROLES.map((r) => ({
      id: r.id,
      label: r.label,
      description: r.description,
    })),
  );
}
