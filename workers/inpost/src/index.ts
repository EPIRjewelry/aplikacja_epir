/// <reference types="@cloudflare/workers-types" />

import { InpostApiClient } from './inpost-api';
import type { Env } from './env';

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const requestOrigin = request.headers.get('Origin');
  const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);

  let allowOrigin = '*';
  if (requestOrigin && allowedOrigins.length > 0) {
    allowOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : '*';
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}

function jsonResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
}

async function handleGetPoints(request: Request, env: Env, client: InpostApiClient): Promise<Response> {
  const url = new URL(request.url);
  const params = {
    country: url.searchParams.get('country') || undefined,
    city: url.searchParams.get('city') || undefined,
    query: url.searchParams.get('query') || undefined,
    latitude: url.searchParams.get('latitude') ? parseFloat(url.searchParams.get('latitude')!) : undefined,
    longitude: url.searchParams.get('longitude') ? parseFloat(url.searchParams.get('longitude')!) : undefined,
    radius: url.searchParams.get('radius') ? parseInt(url.searchParams.get('radius')!) : undefined,
  };

  // Cache strategy:
  // - If query is present → cache the full country dataset (v3:all:PL), then filter locally
  // - Otherwise → cache the specific API request params (v2)
  const cacheKey = params.query
    ? `points:v3:all:${params.country || 'PL'}`
    : `points:v2:${btoa(JSON.stringify(params))}`;

  try {
    // Try KV cache first
    const cached = await env.INPOST_POINTS_CACHE.get<string>(cacheKey);
    if (cached) {
      return jsonResponse(JSON.parse(cached), 200, { ...{ 'X-Cache': 'hit' }, ...corsHeaders(request, env) });
    }

    // Fetch from API
    const points = await client.fetchPoints(params);

    // Cache for 6 hours
    await env.INPOST_POINTS_CACHE.put(cacheKey, JSON.stringify(points), { expirationTtl: 21600 });

    return jsonResponse(points, 200, { ...{ 'X-Cache': 'miss' }, ...corsHeaders(request, env) });
  } catch (e) {
    return jsonResponse({ error: 'Failed to fetch points', details: String(e) }, 500, corsHeaders(request, env));
  }
}

async function handleGetPoint(request: Request, env: Env, client: InpostApiClient, code: string): Promise<Response> {
  try {
    const point = await client.fetchPoint(code);
    if (!point) {
      return jsonResponse({ error: 'Point not found' }, 404);
    }
    return jsonResponse(point);
  } catch (e) {
    console.error('[INPOST_PROXY] Error fetching point:', e);
    return jsonResponse({ error: 'Failed to fetch point', details: String(e) }, 500);
  }
}

async function handleValidate(request: Request, env: Env, client: InpostApiClient): Promise<Response> {
  try {
    const body = await request.json() as { code: string };
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return jsonResponse({ error: 'Missing or invalid code', valid: false }, 400);
    }

    const point = await client.fetchPoint(code);
    const isValid = point !== null && point.active === true;

    return jsonResponse({
      valid: isValid,
      code,
      point: point || null,
    });
  } catch (e) {
    console.error('[INPOST_PROXY] Error validating point:', e);
    return jsonResponse({ error: 'Validation failed', valid: false, details: String(e) }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const client = new InpostApiClient(env);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      // GET /points
      if (request.method === 'GET' && url.pathname === '/points') {
        return handleGetPoints(request, env, client);
      }

      // GET /point/:code
      if (request.method === 'GET' && url.pathname.startsWith('/point/')) {
        const code = url.pathname.replace('/point/', '');
        return handleGetPoint(request, env, client, code);
      }

      // POST /validate
      if (request.method === 'POST' && url.pathname === '/validate') {
        return handleValidate(request, env, client);
      }

      // GET /healthz
      if (request.method === 'GET' && url.pathname === '/healthz') {
        return new Response('ok', { status: 200, headers: corsHeaders(request, env) });
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (e) {
      console.error('[INPOST_PROXY] Unhandled error:', e);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
