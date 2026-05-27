/// <reference types="@cloudflare/workers-types" />

import { WorkerEntrypoint } from 'cloudflare:workers';
import type { StewardInsightsResponse } from '@epir/steward-contract';
import {
  getLatestPeriod,
  loadInsightsForPeriod,
  runStewardAggregation,
  type StewardEnv,
} from './pipeline';
import { ensureStewardTables } from './db';
import { newId, resolveAnalysisPeriod } from './period';

/** S2S RPC — dostęp tylko przez service binding (brak publicznego HTTP na store-steward). */
export class StoreStewardS2SRpc extends WorkerEntrypoint<StewardEnv> {
  async runAggregation(): Promise<StewardInsightsResponse> {
    return runStewardAggregation(this.env);
  }

  async getInsights(args?: {
    period_start?: string;
    period_end?: string;
  }): Promise<StewardInsightsResponse | { ok: false; error: string; status: number }> {
    const periodStart = args?.period_start?.trim();
    const periodEnd = args?.period_end?.trim();
    if (periodStart && periodEnd) {
      return loadInsightsForPeriod(this.env.DB, periodStart, periodEnd);
    }
    const latest = await getLatestPeriod(this.env.DB);
    if (!latest) {
      return { ok: false, error: 'no_insights_yet', status: 404 };
    }
    return loadInsightsForPeriod(this.env.DB, latest.period_start, latest.period_end);
  }

  async saveReport(args: {
    period_start?: string;
    period_end?: string;
    report_markdown: string;
    run_id?: string;
    agent_id?: string;
  }): Promise<{ ok: true; id: string; period_start: string; period_end: string }> {
    const markdown = (args.report_markdown ?? '').trim();
    if (!markdown) {
      throw new Error('report_markdown required');
    }
    const period = resolveAnalysisPeriod(7);
    const period_start = args.period_start?.trim() || period.period_start;
    const period_end = args.period_end?.trim() || period.period_end;
    await ensureStewardTables(this.env.DB);
    const id = newId('rpt');
    await this.env.DB.prepare(
      `INSERT INTO steward_reports (id, period_start, period_end, report_markdown, run_id, agent_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
      .bind(id, period_start, period_end, markdown, args.run_id ?? null, args.agent_id ?? null)
      .run();
    return { ok: true, id, period_start, period_end };
  }
}
