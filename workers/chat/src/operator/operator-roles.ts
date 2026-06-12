/**
 * Operator Studio v2 — 4 role (zamiast 14 trybów × 7 agentów).
 */
export type OperatorRoleId = 'analyst' | 'store_ops' | 'design_blender' | 'creative';

export type OperatorRole = {
  readonly id: OperatorRoleId;
  readonly label: string;
  readonly description: string;
  readonly systemAddon: string;
};

export const OPERATOR_ROLES: readonly OperatorRole[] = [
  {
    id: 'analyst',
    label: 'Analityk',
    description: 'Hurtownia, GA4/Ads, ShopifyQL, raporty, EDOG.',
    systemAddon: `
TRYB: Analityk operacyjny EPIR.
- Priorytet: run_analytics_query, fetch_marketing_preview, run_shopify_shopifyql.
- Cytuj source w JSON; przy FAIL EDOG opisz warstwy przed interpretacją liczb.
- Nie generuj obrazów ani copy reklamowego w tym trybie.
`.trim(),
  },
  {
    id: 'store_ops',
    label: 'Operacje sklepu',
    description: 'Katalog, polityki, Admin read, steward.',
    systemAddon: `
TRYB: Operacje sklepu Shopify (operator).
- Odczyt: search_catalog, search_shop_policies_and_faqs, operator_shopify_admin_read.
- Analityka: run_shopify_shopifyql, steward insights gdy potrzebne.
- Nie używaj koszyka (get_cart/update_cart). Nie publikuj mutacji bez potwierdzenia operatora.
`.trim(),
  },
  {
    id: 'design_blender',
    label: 'Blender / CAD',
    description: 'Most HTTP, packshot, mesh, STL.',
    systemAddon: `
TRYB: Workflow Blender (metryczne mm, biżuteria).
- Gdy most działa: blender_bridge_invoke (ping, mesh, packshot, STL).
- Nie zmyślaj wyników renderu — cytuj metrics/logs z mostu.
`.trim(),
  },
  {
    id: 'creative',
    label: 'Kreacja',
    description: 'Pełny katalog OpenRouter — tekst, obraz, multimodal.',
    systemAddon: `
TRYB: Kreacja (copy, obrazy, briefy wizualne).
- Wybierz model z katalogu OpenRouter (tekst lub image).
- Dostarcz assety i copy do ręcznego wdrożenia — bez auto-publikacji do Shopify.
`.trim(),
  },
] as const;

const ROLE_BY_ID = new Map(OPERATOR_ROLES.map((r) => [r.id, r]));

export function isOperatorRoleId(value: string): value is OperatorRoleId {
  return ROLE_BY_ID.has(value as OperatorRoleId);
}

export function getOperatorRole(id: string | null | undefined): OperatorRole | null {
  if (!id?.trim()) return null;
  return ROLE_BY_ID.get(id.trim() as OperatorRoleId) ?? null;
}

export function resolveOperatorRoleAddonFromHeaders(
  headers: { get(name: string): string | null },
): string {
  const raw =
    headers.get('x-epir-operator-role')?.trim() ??
    headers.get('X-EPIR-OPERATOR-ROLE')?.trim() ??
    '';
  if (!raw) return '';
  return getOperatorRole(raw)?.systemAddon ?? '';
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
