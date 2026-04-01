/**
 * SSOT: pojedynczy interfejs `Env` dla chat workera (typy + nazwy zmiennych).
 * @see workers/chat/wrangler.toml
 */

type AIBinding = { run: (model: string, input: unknown, opts?: unknown) => Promise<unknown> };
type VectorizeIndex = {
  query?: (v: number[], o: { topK: number }) => Promise<unknown>;
  upsert?: (rows: unknown[]) => Promise<unknown>;
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

  SHOPIFY_APP_SECRET: string;
  ALLOWED_ORIGIN?: string;
  ALLOWED_ORIGINS?: string;

  SHOPIFY_STOREFRONT_TOKEN?: string;
  SHOPIFY_ADMIN_TOKEN?: string;
  SHOP_DOMAIN?: string;
  MCP_ENDPOINT?: string;

  PUBLIC_STOREFRONT_API_TOKEN_KAZKA?: string;
  PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY?: string;

  GROQ_API_KEY: string;
  GROQ_PRICE_INPUT_PER_M?: number;
  GROQ_PRICE_OUTPUT_PER_M?: number;
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_NAME?: string;
  USE_WORKERS_AI?: string;
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

export const REQUIRED_SECRETS = ['GROQ_API_KEY'] as const;

export const OPTIONAL_SECRETS = [
  'SHOPIFY_STOREFRONT_TOKEN',
  'PUBLIC_STOREFRONT_API_TOKEN_KAZKA',
  'PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY',
  'SHOPIFY_ADMIN_TOKEN',
  'EPIR_CHAT_SHARED_SECRET',
  'X-EPIR-SHARED-SECRET',
] as const;

export const REQUIRED_VARS = ['SHOP_DOMAIN', 'ALLOWED_ORIGIN'] as const;

export const OPTIONAL_VARS = ['WORKER_ORIGIN', 'DEV_BYPASS'] as const;

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
