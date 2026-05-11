/**
 * CQRS serving layer: R2 SQL (read-only) → D1 materialized aggregates → Workers KV edge cache.
 * Env fields are optional where the pipeline degrades gracefully without R2 SQL secrets.
 */
export type CqrsWorkflowBinding = {
  create(options?: { id?: string; params?: Record<string, never> }): Promise<{ id: string }>;
};

export interface WarehouseCqrsEnv {
  DB: D1Database;
  CHART_EDGE_CACHE?: KVNamespace;
  /** Workflow binding — see wrangler.toml [[workflows]] */
  WAREHOUSE_CQRS_WF: CqrsWorkflowBinding;
  /** Cloudflare account id (same as Workers account) */
  R2_SQL_ACCOUNT_ID?: string;
  /** R2 bucket name backing the Data Catalog / Iceberg warehouse for SQL API path segment */
  R2_SQL_WAREHOUSE_BUCKET?: string;
  /** API token with R2 SQL read + catalog + storage read (wrangler secret put R2_SQL_API_TOKEN) */
  R2_SQL_API_TOKEN?: string;
  /** Iceberg namespace (SQL identifier) */
  WAREHOUSE_SQL_NAMESPACE?: string;
  /** Iceberg table base name (SQL identifier), e.g. epir_pixel_events_raw */
  WAREHOUSE_SQL_TABLE?: string;
  /** Column used for approximate distinct cardinality (default session_id) */
  WAREHOUSE_DISTINCT_COLUMN?: string;
}
