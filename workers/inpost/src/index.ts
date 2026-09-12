/// <reference types="@cloudflare/workers-types" />

import { InpostApiClient, type InpostPoint } from './inpost-api';
import type { Env } from './env';

const COUNTRY_DATASET_TTL = 21600;

export function countryDatasetCacheKey(country: string): string {
  return `points:v4:all:${country}`;
}

export async function getCountryPoints(
  env: Env,
  client: InpostApiClient,
  country: string,
): Promise<{ points: InpostPoint[]; cacheStatus: 'dataset-hit' | 'dataset-miss' }> {
  const datasetKey = countryDatasetCacheKey(country);
  const cached = await env.INPOST_POINTS_CACHE.get<string>(datasetKey);
  if (cached) {
    return { points: JSON.parse(cached) as InpostPoint[], cacheStatus: 'dataset-hit' };
  }

  const points = await client.fetchAllCountryPoints(country);
  await env.INPOST_POINTS_CACHE.put(datasetKey, JSON.stringify(points), {
    expirationTtl: COUNTRY_DATASET_TTL,
  });
  return { points, cacheStatus: 'dataset-miss' };
}

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

  const country = params.country || 'PL';

  try {
    // Search: cache full country dataset, filter per query (never cache filtered results)
    if (params.query) {
      const { points: allPoints, cacheStatus } = await getCountryPoints(env, client, country);
      const results = InpostApiClient.searchPoints(allPoints, params.query, 20);
      return jsonResponse(results, 200, {
        'X-Cache': cacheStatus,
        ...corsHeaders(request, env),
      });
    }

    // Map / geo load: cache per request params (first page ~25 points)
    const cacheKey = `points:v2:${btoa(JSON.stringify(params))}`;
    const cached = await env.INPOST_POINTS_CACHE.get<string>(cacheKey);
    if (cached) {
      return jsonResponse(JSON.parse(cached), 200, {
        'X-Cache': 'hit',
        ...corsHeaders(request, env),
      });
    }

    const points = await client.fetchPoints(params);
    await env.INPOST_POINTS_CACHE.put(cacheKey, JSON.stringify(points), {
      expirationTtl: COUNTRY_DATASET_TTL,
    });

    return jsonResponse(points, 200, {
      'X-Cache': 'miss',
      ...corsHeaders(request, env),
    });
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
