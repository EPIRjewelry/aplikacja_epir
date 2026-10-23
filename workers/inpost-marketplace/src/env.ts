/// <reference types="@cloudflare/workers-types" />

export interface Env {
  /** `stage` (v1 default) or `production` — selects INPSA OAuth + API hosts (ADR 0002). */
  INPSA_ENV: string;
  /** Client Credentials — set via wrangler secret after operator approval. */
  INPSA_CLIENT_ID?: string;
  INPSA_CLIENT_SECRET?: string;
  /**
   * Gates `/ops/inpsa-*` HTTP (Bearer). Reuses existing operator secret name;
   * not required for unit tests or local dev without ops routes.
   */
  EPIR_OPERATOR_PANEL_SECRET?: string;
}
