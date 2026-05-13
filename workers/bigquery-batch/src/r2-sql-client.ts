const R2_SQL_ENDPOINT = 'https://api.sql.cloudflarestorage.com';

export interface R2SqlEnv {
  R2_SQL_ACCOUNT_ID?: string;
  R2_SQL_WAREHOUSE_BUCKET?: string;
  R2_SQL_API_TOKEN?: string;
}

export function isR2SqlQueryConfigured(env: R2SqlEnv): boolean {
  return !!(env.R2_SQL_ACCOUNT_ID?.trim() && env.R2_SQL_WAREHOUSE_BUCKET?.trim() && env.R2_SQL_API_TOKEN?.trim());
}

/** Parsuje odpowiedź HTTP R2 SQL do listy rekordów (obiekty klucz → wartość). */
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

  if (Array.isArray(o.rows) && o.columns && Array.isArray(o.columns)) {
    const cols = (o.columns as unknown[]).map((c) => String(c));
    const rows = o.rows as unknown[];
    return rows.map((row) => {
      const rec: Record<string, unknown> = {};
      if (Array.isArray(row)) {
        row.forEach((v, i) => {
          rec[cols[i] ?? `col_${i}`] = v ?? null;
        });
      }
      return rec;
    });
  }

  if (Array.isArray(o.result)) {
    const r = o.result as unknown[];
    if (r.length > 0 && typeof r[0] === 'object' && r[0] !== null && !Array.isArray(r[0])) {
      return r as Record<string, unknown>[];
    }
  }

  if (typeof o.result === 'object' && o.result !== null && !Array.isArray(o.result)) {
    return [o.result as Record<string, unknown>];
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
