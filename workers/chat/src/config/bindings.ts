/**
 * SSOT: pojedynczy interfejs `Env` dla chat workera (typy + nazwy zmiennych).
 * @see workers/chat/wrangler.toml
 */

type AIBinding = { run: (model: string, input: unknown, opts?: unknown) => Promise<unknown> };
type VectorizeIndex = {
  query?: (v: number[], o: { topK: number; filter?: Record<string, unknown>; returnMetadata?: boolean | string }) => Promise<unknown>;
  upsert?: (rows: unknown[]) => Promise<unknown>;
  deleteByIds?: (ids: string[]) => Promise<unknown>;
};

/**
 * Queue producer binding (Cloudflare Queues).
 * Consumer kontrakt: patrz `src/memory/consumer.ts`.
 */
type QueueProducer<T = unknown> = {
  send: (body: T, options?: { contentType?: string; delaySeconds?: number }) => Promise<void>;
  sendBatch?: (messages: Array<{ body: T; contentType?: string; delaySeconds?: number }>) => Promise<void>;
};

export interface Env {
  // Durable Objects
  SESSION_DO: DurableObjectNamespace;
  RATE_LIMITER_DO: DurableObjectNamespace;
  TOKEN_VAULT_DO: DurableObjectNamespace;

  // D1
  DB: D1Database;
  DB_CHATBOT: D1Database;

  VECTOR_INDEX?: VectorizeIndex;
  /** Vectorize index dla pamięci klienta (typed facts + user-turn embeddings). */
  MEMORY_INDEX?: VectorizeIndex;

  /** Queue producer dla memory-extract pipeline (Etap 3). */
  MEMORY_EXTRACT_QUEUE?: QueueProducer<unknown>;

  /** Feature flagi: włącz producenta/consumera pamięci v2. */
  MEMORY_EXTRACT_ENABLED?: string;
  MEMORY_V2_ENABLED?: string;
  MEMORY_RAW_RETRIEVAL_ENABLED?: string;

  /**
   * Flaga: użyj odchudzonego wariantu `TOOL_SCHEMAS_SLIM` zamiast pełnych
   * schematów przy każdej turze modelu. Redukuje `prompt_tokens` o rząd wielkości
   * 1500 tokenów w typowym zapytaniu. `"true"` = slim; inaczej = full (bezpieczny default).
   * Wymaga redeploy — nie zmienia się w runtime (stabilność prefix cache).
   */
  SLIM_TOOL_SCHEMAS?: string;

  /**
   * KV namespace do cache'owania wyników `search_shop_policies_and_faqs`.
   * Klucz: `policies:v1:${sha256(normalized_query)}`. TTL 6h.
   * Brak bindingu = cache wyłączony (zero regresji).
   */
  POLICIES_CACHE?: KVNamespace;

  SHOPIFY_APP_SECRET: string;
  /** Admin: Settings → Customer accounts — `classic` | `new` (diagnostyka App Proxy / logged_in_customer_id). */
  SHOPIFY_CUSTOMER_ACCOUNTS_MODE?: string;
  ALLOWED_ORIGIN?: string;
  ALLOWED_ORIGINS?: string;

  SHOPIFY_STOREFRONT_TOKEN?: string;
  SHOPIFY_ADMIN_TOKEN?: string;
  SHOP_DOMAIN?: string;
  /** Opcjonalnie: GID wpisu metaobject z tabelą rozmiarów (gdy handle wpisu ≠ `tabela_rozmiarow`). */
  SIZE_TABLE_METAOBJECT_GID?: string;
  MCP_ENDPOINT?: string;
  /** JSON service account (secret) — używane przez google-auth do Bearer tokenów do Google MCP / BigQuery. */
  GCP_SERVICE_ACCOUNT_KEY?: string;
  /** Np. `SERVICE_ACCOUNT` — wymusza JWT OAuth do endpointów MCP wymagających Google (obok heurystyki `bigquery.googleapis.com`). */
  MCP_AUTH_METHOD?: string;

  PUBLIC_STOREFRONT_API_TOKEN_KAZKA?: string;
  PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY?: string;
  PRIVATE_STOREFRONT_API_TOKEN?: string;
  PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY?: string;

  AI?: AIBinding;

  DEV_BYPASS?: string;
  WORKER_ORIGIN?: string;
  EPIR_INTERNAL_KEY?: string;
  EPIR_CHAT_SHARED_SECRET?: string;
  'X-EPIR-SHARED-SECRET'?: string;

  RAG_WORKER?: Fetcher;
  ANALYTICS_WORKER?: Fetcher;
  BIGQUERY_BATCH?: Fetcher;
  ADMIN_KEY?: string;
}

export const REQUIRED_SECRETS = [] as const;

export const OPTIONAL_SECRETS = [
  'SHOPIFY_STOREFRONT_TOKEN',
  'PUBLIC_STOREFRONT_API_TOKEN_KAZKA',
  'PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY',
  'PRIVATE_STOREFRONT_API_TOKEN',
  'PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY',
  'SHOPIFY_ADMIN_TOKEN',
  'EPIR_CHAT_SHARED_SECRET',
  'X-EPIR-SHARED-SECRET',
  'GCP_SERVICE_ACCOUNT_KEY',
] as const;

export const REQUIRED_VARS = ['SHOP_DOMAIN', 'ALLOWED_ORIGIN'] as const;

export const OPTIONAL_VARS = ['WORKER_ORIGIN', 'DEV_BYPASS', 'SHOPIFY_CUSTOMER_ACCOUNTS_MODE'] as const;

export function getEnvBinding<K extends keyof Env>(env: Env, key: K): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === null) {
    throw new Error(`Missing required environment binding: ${String(key)}`);
  }
  return value as NonNullable<Env[K]>;
}

export function getEnvBindingOrDefault<K extends keyof Env, T>(
  env: Env,
  key: K,
  fallback: T,
): NonNullable<Env[K]> | T {
  const value = env[key];
  return value !== undefined && value !== null ? (value as NonNullable<Env[K]>) : fallback;
}

export function validateRequiredBindings(env: Env): void {
  const missing: string[] = [];
  for (const secret of REQUIRED_SECRETS) {
    if (!env[secret]) missing.push(secret);
  }
  for (const varName of REQUIRED_VARS) {
    if (!env[varName]) missing.push(varName);
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment bindings: ${missing.join(', ')}\n` +
        `Set secrets with: wrangler secret put <SECRET_NAME>\n` +
        `Set vars in: wrangler.toml [vars]`,
    );
  }
}

export function getCanonicalMcpUrl(env: Env): string {
  const shopDomain = env.SHOP_DOMAIN || 'epir-art-silver-jewellery.myshopify.com';
  return `https://${shopDomain}/api/mcp`;
}
