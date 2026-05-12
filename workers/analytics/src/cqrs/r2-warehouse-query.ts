import type { WarehouseCqrsEnv } from './types';

const R2_SQL_ENDPOINT = 'https://api.sql.cloudflarestorage.com';

/** Only safe SQL fragments: [a-zA-Z0-9_] */
export function assertSqlIdentifier(name: string, label: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`[CQRS] invalid ${label} identifier (allowed: letters, digits, underscore)`);
  }
  return name;
}

/**
 * Single-table aggregate against Iceberg via R2 SQL HTTP API.
 * Uses probabilistic approximations only (no SELECT DISTINCT / exact distinct).
 */
export async function runWarehouseApproxAggregate(env: WarehouseCqrsEnv): Promise<{
  event_rows: number;
  approx_sessions: number;
  approx_id_len_p50: number;
  raw_sample: unknown;
}> {
  const accountId = (env.R2_SQL_ACCOUNT_ID ?? '').trim();
  const bucket = (env.R2_SQL_WAREHOUSE_BUCKET ?? '').trim();
  const token = (env.R2_SQL_API_TOKEN ?? '').trim();
  if (!accountId || !bucket || !token) {
    throw new Error('[CQRS] R2 SQL not configured (R2_SQL_ACCOUNT_ID, R2_SQL_WAREHOUSE_BUCKET, R2_SQL_API_TOKEN)');
  }

  const ns = assertSqlIdentifier((env.WAREHOUSE_SQL_NAMESPACE ?? 'analytics').trim(), 'namespace');
  const tbl = assertSqlIdentifier((env.WAREHOUSE_SQL_TABLE ?? 'epir_pixel_events').trim(), 'table');
  const distinctCol = assertSqlIdentifier(
    (env.WAREHOUSE_DISTINCT_COLUMN ?? 'session_id').trim(),
    'distinct column',
  );

  const fq = `${ns}.${tbl}`;
  // Probabilistic aggregates only (no SELECT DISTINCT / exact COUNT DISTINCT on high-cardinality keys).
  // approx_percentile_cont on a bounded numeric proxy (string length) keeps memory bounded vs raw IDs.
  const sql = [
    'SELECT',
    '  COUNT(*) AS event_rows,',
    `  approx_distinct(${distinctCol}) AS approx_sessions,`,
    `  approx_percentile_cont(LENGTH(COALESCE(CAST(${distinctCol} AS STRING), ''))::DOUBLE, 0.5) AS approx_id_len_p50`,
    `FROM ${fq}`,
    'LIMIT 500',
  ].join('\n');

  const url = `${R2_SQL_ENDPOINT}/api/v1/accounts/${encodeURIComponent(accountId)}/r2-sql/query/${encodeURIComponent(bucket)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`[CQRS] R2 SQL HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('[CQRS] R2 SQL response is not JSON');
  }

  const row = extractFirstRow(parsed);
  if (!row) {
    throw new Error(`[CQRS] unexpected R2 SQL response shape: ${text.slice(0, 300)}`);
  }

  const event_rows = Number(row.event_rows ?? row.EVENT_ROWS ?? 0) || 0;
  const approx_sessions = Number(row.approx_sessions ?? row.APPROX_SESSIONS ?? 0) || 0;
  const approx_id_len_p50 = Number(row.approx_id_len_p50 ?? row.APPROX_ID_LEN_P50 ?? 0) || 0;

  return { event_rows, approx_sessions, approx_id_len_p50, raw_sample: row };
}

function extractFirstRow(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  if (Array.isArray(o.data) && o.data.length > 0 && typeof o.data[0] === 'object' && o.data[0]) {
    return o.data[0] as Record<string, unknown>;
  }
  if (Array.isArray(o.rows) && o.rows.length > 0 && typeof o.rows[0] === 'object' && o.rows[0]) {
    return o.rows[0] as Record<string, unknown>;
  }
  if (Array.isArray(o.result) && o.result.length > 0 && typeof o.result[0] === 'object' && o.result[0]) {
    return o.result[0] as Record<string, unknown>;
  }
  if (typeof o.result === 'object' && o.result !== null && !Array.isArray(o.result)) {
    return o.result as Record<string, unknown>;
  }
  return null;
}
