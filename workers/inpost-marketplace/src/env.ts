/// <reference types="@cloudflare/workers-types" />

export interface Env {
  /** `stage` (v1 default) or `production` — selects INPSA OAuth + API hosts (ADR 0002). */
  INPSA_ENV: string;
  /** Client Credentials — set via wrangler secret after operator approval. */
  INPSA_CLIENT_ID?: string;
  INPSA_CLIENT_SECRET?: string;
  /**
   * Merchant organization id for INPSA REST paths (`/v1/organizations/{organizationId}/…`).
   * Plain var — set in `[vars]` or `.dev.vars` after operator provides id from portal.
   */
  INPSA_ORGANIZATION_ID?: string;
  /**
   * Gates `/ops/inpsa-*` HTTP (Bearer). Reuses existing operator secret name;
   * not required for unit tests or local dev without ops routes.
   */
  EPIR_OPERATOR_PANEL_SECRET?: string;
  /** D1 — poll cursor + processed marketplace orders (placeholder id in wrangler.toml). */
  INPSA_ORDERS_DB?: D1Database;
  /** Shopify Admin — existing epir_ai secret name (chat convention). */
  SHOPIFY_ADMIN_TOKEN?: string;
  /** Shop hostname, e.g. epir-art-silver-jewellery.myshopify.com */
  SHOP_DOMAIN?: string;
}
