import type { WarehouseCqrsEnv } from './types';
import { ensureWarehouseMaterializationTables } from './d1-materialize';

const CHART_KV_PREFIX = 'cqrs:chart:v1:';

function createServingDbSession(database: D1Database, bookmarkHeaderValue: string | null): {
  db: D1Database;
  getBookmarkForResponse: () => string;
} {
  const bookmarkIn = bookmarkHeaderValue?.trim() ? bookmarkHeaderValue.trim() : 'first-unconstrained';
  const binding = database as unknown as D1Database & {
    withSession?(bookmark: string): D1Database & { getBookmark?: () => string | null };
  };
  if (typeof binding.withSession !== 'function') {
    return { db: database, getBookmarkForResponse: () => '' };
  }
  const session = binding.withSession(bookmarkIn);
  return {
    db: session as unknown as D1Database,
    getBookmarkForResponse: () =>
      (typeof session.getBookmark === 'function' ? session.getBookmark() ?? '' : ''),
  };
}

function withD1BookmarkHeaders(base: Record<string, string>, bookmark: string): Record<string, string> {
  const merged: Record<string, string> = { ...base };
  const trimmed = bookmark.trim();
  if (!trimmed) return merged;
  merged['x-d1-bookmark'] = trimmed;
  const expose = new Set(
    String(merged['Access-Control-Expose-Headers'] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  expose.add('x-d1-bookmark');
  merged['Access-Control-Expose-Headers'] = Array.from(expose).join(', ');
  return merged;
}

/**
 * GET /internal/warehouse/charts?snapshot_date=YYYY-MM-DD
 * Edge KV first; on miss load D1 (D1 Sessions API) and repopulate KV.
 */
export async function handleWarehouseChartsGet(
  request: Request,
  env: WarehouseCqrsEnv,
  corsBase: Record<string, string>,
): Promise<Response> {
  if (!env.CHART_EDGE_CACHE) {
    return new Response(JSON.stringify({ error: 'CHART_EDGE_CACHE binding not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...corsBase },
    });
  }

  const url = new URL(request.url);
  const snapshot = (url.searchParams.get('snapshot_date') ?? '').trim() || utcYesterdayDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot)) {
    return new Response(JSON.stringify({ error: 'invalid snapshot_date (use YYYY-MM-DD)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsBase },
    });
  }

  const kvKey = `${CHART_KV_PREFIX}${snapshot}`;
  const cached = await env.CHART_EDGE_CACHE.get(kvKey, 'text');
  if (cached) {
    return new Response(cached, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-EPIR-Chart-Source': 'kv-edge',
        ...corsBase,
      },
    });
  }

  const { db, getBookmarkForResponse } = createServingDbSession(env.DB, request.headers.get('x-d1-bookmark'));
  await ensureWarehouseMaterializationTables(db);
  const row = await db
    .prepare(
      'SELECT snapshot_date, event_rows, approx_sessions, chart_json, computed_at FROM warehouse_serving_daily WHERE snapshot_date = ?1',
    )
    .bind(snapshot)
    .first<{
      snapshot_date: string;
      event_rows: number;
      approx_sessions: number;
      chart_json: string;
      computed_at: number;
    }>();

  if (!row?.chart_json) {
    const bookmark = getBookmarkForResponse();
    return new Response(JSON.stringify({ error: 'not_materialized', snapshot_date: snapshot }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...withD1BookmarkHeaders(corsBase, bookmark),
        'X-EPIR-Chart-Source': 'd1-miss',
      },
    });
  }

  const bookmark = getBookmarkForResponse();
  await env.CHART_EDGE_CACHE.put(kvKey, row.chart_json, { expirationTtl: 6 * 60 * 60 });

  return new Response(row.chart_json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...withD1BookmarkHeaders(corsBase, bookmark),
      'X-EPIR-Chart-Source': 'd1-materialized',
    },
  });
}

function utcYesterdayDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
