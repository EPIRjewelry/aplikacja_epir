/// <reference types="@cloudflare/workers-types" />

/**
 * Minimal in-memory D1 for Vitest (poll cursor + processed orders only).
 */
export function createMemoryInpsaOrdersDb(): D1Database {
  let lastSuccessEventId: string | null = null;
  const processed = new Map<
    string,
    {
      marketplace_order_id: string;
      idempotency_key: string;
      shopify_order_gid: string | null;
      status: string;
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
          return { last_success_event_id: lastSuccessEventId } as T;
        }
        if (sql.includes('FROM inpsa_processed_orders') && sql.includes('idempotency_key')) {
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
        } else if (sql.includes('INSERT INTO inpsa_processed_orders')) {
          const marketplace_order_id = String(binds[0]);
          processed.set(marketplace_order_id, {
            marketplace_order_id,
            idempotency_key: String(binds[1]),
            shopify_order_gid: binds[2] == null ? null : String(binds[2]),
            status: String(binds[3]),
            updated_at_ms: Number(binds[4]),
          });
        }
        return { success: true, meta: { changes: 1 } } as D1Result;
      },
      async all() {
        return { results: [], success: true } as D1Result;
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
