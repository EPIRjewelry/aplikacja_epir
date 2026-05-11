import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import type { WarehouseCqrsEnv } from './types';
import { runWarehouseApproxAggregate } from './r2-warehouse-query';
import { buildChartJson, upsertServingDay, writeMaterializationMeta } from './d1-materialize';

function utcSnapshotDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Durable orchestration: R2 SQL (approx aggregates) → D1 materialized row → KV warm.
 */
export class WarehouseCqrsWorkflow extends WorkflowEntrypoint<WarehouseCqrsEnv, Record<string, never>> {
  async run(_event: WorkflowEvent<Record<string, never>>, step: WorkflowStep): Promise<{ snapshot_date: string }> {
    if (!this.env.CHART_EDGE_CACHE) {
      throw new Error('[CQRS_WF] CHART_EDGE_CACHE binding required');
    }

    const snapshot_date = await step.do('resolve-snapshot-date', async () => utcSnapshotDate(new Date()));

    const agg = await step.do(
      'r2-sql-approx-aggregate',
      { retries: { limit: 4, delay: '10 seconds', backoff: 'exponential' } },
      async () => runWarehouseApproxAggregate(this.env),
    );

    const chart_json = await step.do('build-chart-json', async () =>
      buildChartJson({
        snapshot_date,
        event_rows: agg.event_rows,
        approx_sessions: agg.approx_sessions,
        approx_id_len_p50: agg.approx_id_len_p50,
        raw_sample: agg.raw_sample,
      }),
    );

    const computed_at = await step.do('persist-d1-materialized', async () => {
      const now = Date.now();
      await upsertServingDay(this.env.DB, {
        snapshot_date,
        event_rows: agg.event_rows,
        approx_sessions: agg.approx_sessions,
        chart_json,
        computed_at: now,
      });
      await writeMaterializationMeta(this.env.DB, true, { event_rows: agg.event_rows });
      return now;
    });

    await step.do('warm-kv-edge-cache', { retries: { limit: 3, delay: '2 seconds' } }, async () => {
      const key = `cqrs:chart:v1:${snapshot_date}`;
      await this.env.CHART_EDGE_CACHE!.put(key, chart_json, {
        expirationTtl: 6 * 60 * 60,
      });
      return { key, computed_at };
    });

    console.log('[CQRS_WF] materialization complete', { snapshot_date, computed_at });
    return { snapshot_date };
  }
}
