/**
 * RAG Worker - Main Entry Point
 * 
 * Reusable RAG orchestration worker exposing REST API for:
 * - Product search (MCP primary source)
 * - Policy/FAQ search (MCP primary; Vectorize only for non-binding FAQ — KB-clamp)
 * - Full context building (all sources)
 * 
 * DESIGN PRINCIPLES:
 * - MCP ALWAYS primary source (anti-hallucination strategy)
 * - Vectorize only as fallback for non-binding FAQ/blog-like queries when MCP is empty (KB-clamp: no Vectorize for binding policies)
 * - Clean REST API for Service Binding integration
 * - No hardcoded secrets (env.SHOP_DOMAIN from wrangler.toml vars)
 * 
 * ENDPOINTS:
 * - POST /search/products - Product catalog search via MCP
 * - POST /search/policies - FAQ/policies search (MCP + Vectorize)
 * - POST /context/build - Full RAG context for AI consumption
 * - GET /health - Health check
 * 
 * @see workers/worker/src/rag.ts - Original implementation
 * @see Model Agentowy i Ekosystem Shopify.txt - MCP specifications
 */

import {
  orchestrateRag,
  detectIntent,
  UserIntent,
} from './domain/orchestrator';
import {
  formatRagContextForPrompt,
  formatRagForPrompt,
  hasHighConfidenceResults,
} from './domain/formatter';
import {
  VectorizeIndex,
  AIBinding,
  upsertDocuments,
  searchKazkaDropVectorize,
  formatKazkaDropResultsForPrompt,
} from './services/vectorize';
import { runKazkaIngest } from './ingest/kazka-storefront-ingest';

/**
 * Cloudflare Worker environment bindings
 */
export interface Env {
  /**
   * Vectorize index for FAQ embeddings
   */
  VECTOR_INDEX?: VectorizeIndex;

  /**
   * Cloudflare AI binding for embeddings
   */
  AI?: AIBinding;

  /**
   * D1 database for caching
   */
  DB?: D1Database;

  /**
   * Shop domain (from wrangler.toml vars)
   */
  SHOP_DOMAIN?: string;

  /**
   * Canonical MCP URL (from wrangler.toml vars)
   */
  CANONICAL_MCP_URL?: string;
  
  /**
   * Admin token for protected endpoints (set via wrangler secret put ADMIN_TOKEN)
   */
  ADMIN_TOKEN?: string;

  /** Storefront token Kazka — ingest dropu (secret, ten sam co w chat worker). */
  PUBLIC_STOREFRONT_API_TOKEN_KAZKA?: string;

  /** CSV handles — szyna bezpieczeństwa ingestu (vars). */
  KAZKA_COLLECTION_FILTER?: string;
}

/**
 * Request body for /search/products
 */
interface ProductSearchRequest {
  query: string;
  productType?: string;
}

/**
 * Request body for /search/policies
 */
interface PolicySearchRequest {
  query: string;
  topK?: number;
}

/**
 * Request body for /context/build
 */
interface ContextBuildRequest {
  query: string;
  intent?: UserIntent;
  cartId?: string | null;
  topK?: number;
}

interface KazkaSearchRequest {
  query: string;
  topK?: number;
  collectionHandle?: string;
  type?: 'product' | 'collection';
}

function getMcpEndpoint(env: Env): string | undefined {
  return env.CANONICAL_MCP_URL?.trim() || (env.SHOP_DOMAIN ? `https://${env.SHOP_DOMAIN.replace(/\/$/, '')}/api/mcp` : undefined);
}

/** First Accept-Language tag (trimmed), for KB-clamp observability only. */
function localeFromRequest(request: Request): string | undefined {
  const al = request.headers.get('accept-language');
  if (!al) return undefined;
  const first = al.split(',')[0]?.trim();
  return first ? first.slice(0, 24) : undefined;
}

function looksLikePlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length < 32
    || normalized.includes('replace_me')
    || normalized.includes('placeholder')
    || normalized.includes('changeme')
    || normalized.includes('dev-')
  );
}

function readAdminTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('authorization')?.trim() ?? '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    return bearerToken.length > 0 ? bearerToken : null;
  }

  const legacyHeader = request.headers.get('x-admin-token')?.trim() ?? '';
  return legacyHeader.length > 0 ? legacyHeader : null;
}

function timingSafeEquals(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);

  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

function authorizeAdmin(request: Request, env: Env): Response | null {
  const configuredAdminToken = env.ADMIN_TOKEN?.trim() ?? '';
  const requestAdminToken = readAdminTokenFromRequest(request);
  const hasSafeConfiguredToken =
    configuredAdminToken.length > 0 && !looksLikePlaceholderSecret(configuredAdminToken);

  if (
    !hasSafeConfiguredToken
    || !requestAdminToken
    || !timingSafeEquals(requestAdminToken, configuredAdminToken)
  ) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  return null;
}

/**
 * Main Worker fetch handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for cross-origin requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // ========================================
      // GET /health - Health check
      // ========================================
      if (url.pathname === '/health' && request.method === 'GET') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            service: 'epir-rag-worker',
            timestamp: new Date().toISOString(),
            bindings: {
              vectorIndex: !!env.VECTOR_INDEX,
              ai: !!env.AI,
              db: !!env.DB,
              shopDomain: env.SHOP_DOMAIN || 'not_set',
              mcpUrl: env.CANONICAL_MCP_URL || 'not_set',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          }
        );
      }

      // ========================================
      // POST /search/products - Product search
      // ========================================
      if (url.pathname === '/search/products' && request.method === 'POST') {
        const body = (await request.json()) as ProductSearchRequest;
        const { query, productType = 'biżuteria' } = body;

        if (!query) {
          return new Response(
            JSON.stringify({ error: 'Missing required field: query' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        const ragResult = await orchestrateRag({
          query,
          intent: 'search',
          mcpEndpoint: getMcpEndpoint(env),
          locale: localeFromRequest(request),
        });

        if (!ragResult.ok) {
          return new Response(
            JSON.stringify({ ok: false, query, error: ragResult.error }),
            { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        return new Response(
          JSON.stringify({ ok: true, query, context: ragResult.context }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // ========================================
      // POST /search/policies - FAQ/policies search
      // ========================================
      if (url.pathname === '/search/policies' && request.method === 'POST') {
        const body = (await request.json()) as PolicySearchRequest;
        const { query, topK = 3 } = body;

        if (!query) {
          return new Response(
            JSON.stringify({ error: 'Missing required field: query' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        const ragResult = await orchestrateRag({
          query,
          intent: 'faq',
          vectorIndex: env.VECTOR_INDEX,
          aiBinding: env.AI,
          topK,
          mcpEndpoint: getMcpEndpoint(env),
          locale: localeFromRequest(request),
        });

        if (!ragResult.ok) {
          return new Response(
            JSON.stringify({
              ok: false,
              query,
              error: ragResult.error,
              code: ragResult.error.code,
            }),
            { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        return new Response(
          JSON.stringify({ ok: true, query, context: ragResult.context }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // ========================================
      // POST /search/kazka - Kazka drop RAG (Vectorize)
      // ========================================
      if (url.pathname === '/search/kazka' && request.method === 'POST') {
        const body = (await request.json()) as KazkaSearchRequest;
        const { query, topK = 5, collectionHandle, type } = body;

        if (!query?.trim()) {
          return new Response(
            JSON.stringify({ error: 'Missing required field: query' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
          );
        }

        if (!env.VECTOR_INDEX || !env.AI) {
          return new Response(
            JSON.stringify({ error: 'Vectorize bindings not configured' }),
            { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
          );
        }

        const results = await searchKazkaDropVectorize(
          query.trim(),
          env.VECTOR_INDEX,
          env.AI,
          { topK, collectionHandle, type },
        );

        return new Response(
          JSON.stringify({
            ok: true,
            query,
            context: formatKazkaDropResultsForPrompt(results),
            results,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        );
      }

      // ========================================
      // POST /context/build - Full RAG context
      // ========================================
      if (url.pathname === '/context/build' && request.method === 'POST') {
        const body = (await request.json()) as ContextBuildRequest;
        const { query, intent, cartId, topK = 3 } = body;

        if (!query) {
          return new Response(
            JSON.stringify({ error: 'Missing required field: query' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        // Auto-detect intent if not provided
        const finalIntent = intent || detectIntent(query);

        const ragResult = await orchestrateRag({
          query,
          intent: finalIntent,
          cartId,
          vectorIndex: env.VECTOR_INDEX,
          aiBinding: env.AI,
          topK,
          mcpEndpoint: getMcpEndpoint(env),
          locale: localeFromRequest(request),
        });

        if (!ragResult.ok) {
          return new Response(
            JSON.stringify({
              ok: false,
              query,
              intent: finalIntent,
              error: ragResult.error,
              code: ragResult.error.code,
            }),
            { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            query,
            intent: finalIntent,
            context: ragResult.context,
            hasHighConfidence: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // ========================================
      // 404 Not Found
      // ========================================
      // ========================================
      // POST /admin/upsert - Admin-only upsert to Vectorize
      // Body: { docs: [{ id: string, text: string, metadata?: any }, ...] }
      // Protected via secret token (Authorization: Bearer <token>, legacy: X-ADMIN-TOKEN)
      // Fail-closed: missing/weak/placeholder env token => always reject.
      // ========================================
      if (url.pathname === '/admin/upsert' && request.method === 'POST') {
        const unauthorized = authorizeAdmin(request, env);
        if (unauthorized) {
          return new Response(unauthorized.body, {
            status: unauthorized.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const body = await request.json().catch(() => null);
        if (!body || !Array.isArray(body.docs) || body.docs.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Missing docs array' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }

        try {
          // Upsert documents (worker will generate embeddings via env.AI)
          await upsertDocuments(body.docs, env.VECTOR_INDEX, env.AI as AIBinding);
          return new Response(
            JSON.stringify({ ok: true, upserted: body.docs.length }),
            { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        } catch (err: any) {
          console.error('[RAG_WORKER] Admin upsert failed:', err);
          return new Response(
            JSON.stringify({ error: 'Upsert failed', message: err?.message || String(err) }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }
      }

      // ========================================
      // POST /admin/ingest/kazka - Full Kazka drop ingest → Vectorize
      // ========================================
      if (url.pathname === '/admin/ingest/kazka' && request.method === 'POST') {
        const unauthorized = authorizeAdmin(request, env);
        if (unauthorized) {
          return new Response(unauthorized.body, {
            status: unauthorized.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        try {
          const result = await runKazkaIngest(env);
          return new Response(
            JSON.stringify({ ok: true, ...result }),
            { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
          );
        } catch (err: any) {
          console.error('[RAG_WORKER] Kazka ingest failed:', err);
          return new Response(
            JSON.stringify({ error: 'Ingest failed', message: err?.message || String(err) }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
          );
        }
      }

      return new Response(
        JSON.stringify({
          error: 'Not Found',
          availableEndpoints: [
            'GET /health',
            'POST /search/products',
            'POST /search/policies',
            'POST /search/kazka',
            'POST /context/build',
            'POST /admin/upsert',
            'POST /admin/ingest/kazka',
          ],
        }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );

    } catch (error: any) {
      console.error('[RAG_WORKER] ❌ Unhandled error:', error);

      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: error?.message || 'Unknown error',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          console.log(JSON.stringify({ tag: 'kazka.ingest.cron', scheduledTime: event.scheduledTime }));
          const result = await runKazkaIngest(env);
          console.log(JSON.stringify({ tag: 'kazka.ingest.cron.done', ...result }));
        } catch (err) {
          console.error('[RAG_WORKER] scheduled Kazka ingest failed:', err);
        }
      })(),
    );
  },
};
