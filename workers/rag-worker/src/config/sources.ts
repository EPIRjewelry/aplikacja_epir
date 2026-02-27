/**
 * RAG Worker - Configuration: Sources and Priorities
 * 
 * Defines canonical URLs for data sources and their priority order.
 * Based on Shopify MCP documentation and architectural best practices.
 * 
 * @see Harmony Chat_ Shopify, MCP, API, UX.txt
 * @see Model Agentowy i Ekosystem Shopify.txt
 */

/**
 * MCP endpoint URL - z wrangler.toml [vars] CANONICAL_MCP_URL.
 * Używaj env.CANONICAL_MCP_URL - NIE hardkoduj.
 * CHAT_SPEC: shopify-admin-mcp = https://{shop_domain}/api/mcp
 */

/**
 * Data source priority for RAG orchestration
 * 
 * Priority order (highest to lowest):
 * 1. MCP (Shopify Storefront MCP) - real-time product/cart/order data
 * 2. Vectorize (FAQ embeddings) - fallback for policies/FAQ when MCP unavailable
 * 3. Cache (D1) - cached results for performance optimization
 * 
 * MCP is ALWAYS preferred as primary source per architectural guidelines.
 */
export const SOURCE_PRIORITY = ['mcp', 'vectorize', 'cache'] as const;
export type DataSource = typeof SOURCE_PRIORITY[number];

/**
 * MCP Tools - Shopify Storefront MCP
 * 
 * DO NOT INVENT NEW TOOL NAMES - use only officially supported tools:
 * 
 * @see workers/worker/src/rag.ts for current implementations
 */
export const MCP_TOOLS = {
  // Product catalog search
  SEARCH_CATALOG: 'search_shop_catalog',
  
  // Cart operations
  GET_CART: 'get_cart',
  UPDATE_CART: 'update_cart',
  
  // Order operations
  GET_RECENT_ORDER: 'get_most_recent_order_status',
  
  // Policies and FAQ (may also use Vectorize fallback)
  SEARCH_POLICIES_FAQ: 'search_shop_policies_and_faqs',
} as const;

/**
 * Retry configuration for MCP calls
 * 
 * MCP calls may fail due to network issues or rate limits (429).
 * Use exponential backoff with max 3 attempts.
 */
export const MCP_RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_BACKOFF_MS: 100,
  MAX_BACKOFF_MS: 1000,
} as const;

/**
 * Vectorize configuration
 * 
 * Used for FAQ/policies similarity search when MCP is unavailable
 * or for semantic search that MCP doesn't support.
 */
export const VECTORIZE_CONFIG = {
  // Embedding model for queries (Cloudflare AI binding)
  EMBEDDING_MODEL: '@cf/baai/bge-large-en-v1.5',
  
  // Default number of results to retrieve
  DEFAULT_TOP_K: 3,
  
  // Minimum similarity score threshold (0-1)
  MIN_SCORE_THRESHOLD: 0.7,
} as const;

/**
 * Cache TTL (Time To Live) in seconds
 * 
 * D1 cache for frequently accessed data to reduce MCP calls
 */
export const CACHE_TTL = {
  PRODUCTS: 300,      // 5 minutes
  POLICIES: 3600,     // 1 hour
  FAQ: 3600,          // 1 hour
  CART: 60,           // 1 minute (short TTL for real-time data)
} as const;
