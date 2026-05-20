/** Wrangler `vars` + `secret` MARKETING_OPS_BEARER_TOKEN. */
export interface Env {
  MarketingSidecarAgent: DurableObjectNamespace;
  MARKETING_INGEST_ORIGIN: string;
  MARKETING_OPS_BEARER_TOKEN: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_DEFAULT_MODEL?: string;
}
