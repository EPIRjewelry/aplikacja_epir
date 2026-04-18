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
import { VectorizeIndex, AIBinding, upsertDocuments } from './services/vectorize';

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
   * Admin token for protected endpoints (set via wrangler.toml vars)
   */
  ADMIN_TOKEN?: string;
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
      // Protected via header: X-ADMIN-TOKEN must match env.ADMIN_TOKEN
      // ========================================
      if (url.pathname === '/admin/upsert' && request.method === 'POST') {
        const adminToken = (request.headers.get('x-admin-token') || request.headers.get('X-ADMIN-TOKEN') || '').trim();
        if (!env.ADMIN_TOKEN || adminToken !== env.ADMIN_TOKEN) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
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

      return new Response(
        JSON.stringify({
          error: 'Not Found',
          availableEndpoints: [
            'GET /health',
            'POST /search/products',
            'POST /search/policies',
            'POST /context/build',
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
};
