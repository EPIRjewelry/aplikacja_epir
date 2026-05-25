import { STEWARD_CONTRACT_VERSION, type StewardInsightsResponse } from '@epir/steward-contract';
import { aggregatePixelSignals } from './aggregate-d1';
import { ensureStewardTables } from './db';
import { deriveInsights, persistInsights } from './insights';
import { resolveAnalysisPeriod } from './period';
import { fetchWarehouseSignals, type BigQueryBatchRpcStub } from './warehouse';

export interface StewardEnv {
  DB: D1Database;
  BIGQUERY_BATCH_RPC?: BigQueryBatchRpcStub;
  STEWARD_LOOKBACK_DAYS?: string;
}

function parseLookbackDays(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 7;
}

async function clearPeriodSlice(db: D1Database, period_start: string, period_end: string): Promise<void> {
  await db.prepare('DELETE FROM store_signals WHERE period_start = ?1 AND period_end = ?2').bind(period_start, period_end).run();
  await db.prepare('DELETE FROM steward_insights WHERE period_start = ?1 AND period_end = ?2').bind(period_start, period_end).run();
}

export async function runStewardAggregation(env: StewardEnv): Promise<StewardInsightsResponse> {
  await ensureStewardTables(env.DB);
  const period = resolveAnalysisPeriod(parseLookbackDays(env.STEWARD_LOOKBACK_DAYS));
  await clearPeriodSlice(env.DB, period.period_start, period.period_end);

  const d1Signals = await aggregatePixelSignals(env.DB, period);
  const { signals: whSignals, queries } = await fetchWarehouseSignals(env.BIGQUERY_BATCH_RPC, env.DB, period);
  const allSignals = [...d1Signals, ...whSignals];

  const drafts = deriveInsights(period, allSignals);
  const insights = await persistInsights(env.DB, period, drafts);

  return {
    contract_version: STEWARD_CONTRACT_VERSION,
    period_start: period.period_start,
    period_end: period.period_end,
    signals: allSignals,
    insights,
    warehouse_queries: queries,
  };
}

export async function loadInsightsForPeriod(
  db: D1Database,
  period_start: string,
  period_end: string,
): Promise<StewardInsightsResponse> {
  await ensureStewardTables(db);
  const signals = await db
    .prepare('SELECT * FROM store_signals WHERE period_start = ?1 AND period_end = ?2 ORDER BY metric_value DESC LIMIT 200')
    .bind(period_start, period_end)
    .all();
  const insights = await db
    .prepare('SELECT * FROM steward_insights WHERE period_start = ?1 AND period_end = ?2 ORDER BY confidence DESC')
    .bind(period_start, period_end)
    .all();

  return {
    contract_version: STEWARD_CONTRACT_VERSION,
    period_start,
    period_end,
    signals: (signals.results ?? []) as StewardInsightsResponse['signals'],
    insights: (insights.results ?? []) as StewardInsightsResponse['insights'],
    warehouse_queries: [],
  };
}

export async function getLatestPeriod(db: D1Database): Promise<{ period_start: string; period_end: string } | null> {
  const row = await db
    .prepare(
      `SELECT period_start, period_end FROM steward_insights
       ORDER BY created_at DESC LIMIT 1`,
    )
    .first<{ period_start: string; period_end: string }>();
  return row ?? null;
}
