const R2_SQL_ENDPOINT = 'https://api.sql.cloudflarestorage.com';

export interface R2SqlEnv {
  R2_SQL_ACCOUNT_ID?: string;
  R2_SQL_WAREHOUSE_BUCKET?: string;
  R2_SQL_API_TOKEN?: string;
}

export function isR2SqlQueryConfigured(env: R2SqlEnv): boolean {
  return !!(env.R2_SQL_ACCOUNT_ID?.trim() && env.R2_SQL_WAREHOUSE_BUCKET?.trim() && env.R2_SQL_API_TOKEN?.trim());
}

function columnNamesFromSchema(schema: unknown): string[] | null {
  if (!Array.isArray(schema) || schema.length === 0) return null;
  if (typeof schema[0] === 'string') return schema.map((c) => String(c));
  if (typeof schema[0] === 'object' && schema[0] !== null) {
    return (schema as Record<string, unknown>[]).map((c, i) => {
      const name = c.name ?? c.column_name ?? c.field;
      return name != null ? String(name) : `col_${i}`;
    });
  }
  return null;
}

function matrixToRecords(cols: string[], rows: unknown[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const rec: Record<string, unknown> = {};
    if (Array.isArray(row)) {
      row.forEach((v, i) => {
        rec[cols[i] ?? `col_${i}`] = v ?? null;
      });
    } else if (row && typeof row === 'object') {
      return row as Record<string, unknown>;
    }
    return rec;
  });
}

/**
 * Parsuje odpowiedź HTTP R2 SQL do listy rekordów (obiekty klucz → wartość).
 * Obsługuje m.in. opakowanie `{ result: { schema|columns, rows, metrics } }` z API prod.
 */
export function parseR2SqlJsonToRows(body: unknown): Record<string, unknown>[] {
  if (body === null || body === undefined || typeof body !== 'object') {
    return [];
  }
  const o = body as Record<string, unknown>;

  if (Array.isArray(o.data) && o.data.length > 0) {
    if (typeof o.data[0] === 'object' && o.data[0] !== null && !Array.isArray(o.data[0])) {
      return o.data as Record<string, unknown>[];
    }
  }

  // Prod R2 SQL: { result: { request_id, schema, rows, metrics } }
  if (typeof o.result === 'object' && o.result !== null && !Array.isArray(o.result)) {
    const inner = o.result as Record<string, unknown>;
    if (Array.isArray(inner.rows)) {
      const cols =
        columnNamesFromSchema(inner.schema) ??
        (Array.isArray(inner.columns) ? (inner.columns as unknown[]).map((c) => String(c)) : null);
      if (cols && inner.rows.length > 0 && Array.isArray(inner.rows[0])) {
        return matrixToRecords(cols, inner.rows as unknown[]);
      }
      if (inner.rows.length > 0 && typeof inner.rows[0] === 'object' && !Array.isArray(inner.rows[0])) {
        return inner.rows as Record<string, unknown>[];
      }
      return [];
    }
  }

  if (Array.isArray(o.rows) && o.columns && Array.isArray(o.columns)) {
    const cols = (o.columns as unknown[]).map((c) => String(c));
    return matrixToRecords(cols, o.rows as unknown[]);
  }

  if (Array.isArray(o.rows) && o.schema) {
    const cols = columnNamesFromSchema(o.schema);
    if (cols) return matrixToRecords(cols, o.rows as unknown[]);
  }

  if (Array.isArray(o.result)) {
    const r = o.result as unknown[];
    if (r.length > 0 && typeof r[0] === 'object' && r[0] !== null && !Array.isArray(r[0])) {
      return r as Record<string, unknown>[];
    }
  }

  return [];
}

export async function runR2SqlJob(
  env: R2SqlEnv,
  query: string,
): Promise<{ rows?: Record<string, unknown>[]; error?: string }> {
  const accountId = (env.R2_SQL_ACCOUNT_ID ?? '').trim();
  const bucket = (env.R2_SQL_WAREHOUSE_BUCKET ?? '').trim();
  const token = (env.R2_SQL_API_TOKEN ?? '').trim();
  if (!accountId || !bucket || !token) {
    return { error: 'R2 SQL not configured (R2_SQL_ACCOUNT_ID, R2_SQL_WAREHOUSE_BUCKET, R2_SQL_API_TOKEN)' };
  }

  const url = `${R2_SQL_ENDPOINT}/api/v1/accounts/${encodeURIComponent(accountId)}/r2-sql/query/${encodeURIComponent(bucket)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: query.trim() }),
  });
  const text = await res.text();
  if (!res.ok) {
    return { error: `R2 SQL HTTP ${res.status}: ${text.slice(0, 400)}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { error: 'R2 SQL response is not JSON' };
  }
  const rows = parseR2SqlJsonToRows(parsed);
  return { rows };
}
