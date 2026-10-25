/// <reference types="@cloudflare/workers-types" />

/**
 * Minimal in-memory D1 for Vitest (poll cursor + processed orders only).
 */
export function createMemoryInpsaOrdersDb(): D1Database {
  let lastSuccessEventId: string | null = null;
  let lastSuccessOccurredAt: string | null = null;
  const processed = new Map<
    string,
    {
      marketplace_order_id: string;
      idempotency_key: string;
      shopify_order_gid: string | null;
      status: string;
      event_id: string | null;
      last_error: string | null;
      updated_at_ms: number;
    }
  >();

  function prepare(sql: string) {
    const binds: unknown[] = [];
    const stmt = {
      bind(...args: unknown[]) {
        binds.length = 0;
        binds.push(...args);
        return stmt;
      },
      async first<T>(): Promise<T | null> {
        if (sql.includes('FROM inpsa_poll_state')) {
          return {
            last_success_event_id: lastSuccessEventId,
            last_success_occurred_at: lastSuccessOccurredAt,
          } as T;
        }
        if (sql.includes('FROM inpsa_processed_orders') && sql.includes('idempotency_key = ?')) {
          const key = String(binds[0] ?? '');
          for (const row of processed.values()) {
            if (row.idempotency_key === key) return row as T;
          }
          return null;
        }
        return null;
      },
      async run(): Promise<D1Result> {
        if (sql.includes('INSERT INTO inpsa_poll_state')) {
          lastSuccessEventId = binds[1] == null ? null : String(binds[1]);
          lastSuccessOccurredAt = binds[2] == null ? null : String(binds[2]);
        } else if (sql.includes('INSERT INTO inpsa_processed_orders')) {
          const marketplace_order_id = String(binds[0]);
          const idempotency_key = String(binds[1]);
          for (const row of processed.values()) {
            if (row.marketplace_order_id === marketplace_order_id || row.idempotency_key === idempotency_key) {
              throw new Error('UNIQUE constraint failed: inpsa_processed_orders');
            }
          }
          processed.set(marketplace_order_id, {
            marketplace_order_id,
            idempotency_key,
            shopify_order_gid: binds[2] == null ? null : String(binds[2]),
            status: String(binds[3]),
            event_id: binds[4] == null ? null : String(binds[4]),
            last_error: binds[5] == null ? null : String(binds[5]),
            updated_at_ms: Number(binds[6]),
          });
        } else if (sql.includes('UPDATE inpsa_processed_orders')) {
          const marketplace_order_id = String(binds[5]);
          const row = processed.get(marketplace_order_id);
          if (!row) throw new Error(`no row ${marketplace_order_id}`);
          row.shopify_order_gid = binds[0] == null ? null : String(binds[0]);
          row.status = String(binds[1]);
          row.event_id = binds[2] == null ? null : String(binds[2]);
          row.last_error = binds[3] == null ? null : String(binds[3]);
          row.updated_at_ms = Number(binds[4]);
        }
        return { success: true, meta: { changes: 1 } } as D1Result;
      },
      async all<T>() {
        if (sql.includes('status IN')) {
          const results = [...processed.values()].filter((row) =>
            row.status === 'pending' || row.status === 'unmatched_sku' || row.status === 'error',
          );
          return { results: results as T[], success: true } as D1Result<T>;
        }
        return { results: [] as T[], success: true } as D1Result<T>;
      },
    };
    return stmt;
  }

  return {
    prepare,
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}
