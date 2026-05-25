import type { StewardInsightsResponse } from '@epir/steward-contract';

export type StoreStewardRpcStub = {
  runAggregation(): Promise<StewardInsightsResponse>;
  getInsights(args?: {
    period_start?: string;
    period_end?: string;
  }): Promise<StewardInsightsResponse | { ok: false; error: string; status: number }>;
  saveReport(args: {
    period_start?: string;
    period_end?: string;
    report_markdown: string;
    run_id?: string;
    agent_id?: string;
  }): Promise<{ ok: true; id: string; period_start: string; period_end: string }>;
};
