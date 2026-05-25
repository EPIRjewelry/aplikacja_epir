import type { AnalysisPeriod } from './period';
import { newId } from './period';
import type { StoreSignal } from '@epir/steward-contract';

export type BigQueryBatchRpcStub = {
  runAnalyticsQuery(args: { queryId?: string }): Promise<
    | { ok: true; queryId: string; rows: Record<string, unknown>[] }
    | { ok: false; error: string; status: number }
  >;
};

export const PHASE0_WAREHOUSE_QUERY_IDS = [
  'Q2_CONVERSION_PATHS',
  'Q4_STOREFRONT_SEGMENTATION',
  'Q5_TOP_PRODUCTS',
  'Q7_PRODUCT_TO_PURCHASE',
  'Q8_DAILY_EVENTS',
] as const;

export type WarehouseQueryResult = {
  queryId: string;
  ok: boolean;
  row_count: number;
  error?: string;
};

export async function fetchWarehouseSignals(
  rpc: BigQueryBatchRpcStub | undefined,
  db: D1Database,
  period: AnalysisPeriod,
): Promise<{ signals: StoreSignal[]; queries: WarehouseQueryResult[] }> {
  const signals: StoreSignal[] = [];
  const queries: WarehouseQueryResult[] = [];

  if (!rpc) {
    return { signals, queries };
  }

  for (const queryId of PHASE0_WAREHOUSE_QUERY_IDS) {
    try {
      const result = await rpc.runAnalyticsQuery({ queryId });
      if (!result.ok) {
        queries.push({ queryId, ok: false, row_count: 0, error: result.error });
        continue;
      }
      queries.push({ queryId, ok: true, row_count: result.rows.length });
      const id = newId('wh');
      await db
        .prepare(
          `INSERT INTO store_signals (
            id, period_start, period_end, signal_key, storefront_id, channel,
            product_handle, product_id, metric_name, metric_value, metric_unit, evidence_json, source
          ) VALUES (?1, ?2, ?3, ?4, NULL, NULL, NULL, NULL, ?5, ?6, 'rows', ?7, 'r2_sql')`,
        )
        .bind(
          id,
          period.period_start,
          period.period_end,
          `warehouse_${queryId}`,
          'row_count',
          result.rows.length,
          JSON.stringify({ sample: result.rows.slice(0, 5) }),
        )
        .run();
      signals.push({
        id,
        period_start: period.period_start,
        period_end: period.period_end,
        signal_key: `warehouse_${queryId}`,
        storefront_id: null,
        channel: null,
        product_handle: null,
        product_id: null,
        metric_name: 'row_count',
        metric_value: result.rows.length,
        metric_unit: 'rows',
        evidence_json: JSON.stringify({ sample: result.rows.slice(0, 5) }),
        source: 'r2_sql',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      queries.push({ queryId, ok: false, row_count: 0, error: message });
    }
  }

  return { signals, queries };
}
