import type { StewardInsightsResponse } from '@epir/steward-contract';

export interface FetchInsightsOptions {
  /** Origin epir-analyst-worker (np. https://epir-analyst-worker.<account>.workers.dev) */
  analystOrigin: string;
  /** Ten sam Bearer co POST /v1/warehouse/query — wrangler secret ANALYST_HTTP_BEARER */
  bearer: string;
  periodStart?: string;
  periodEnd?: string;
}

function authHeaders(bearer: string): HeadersInit {
  return {
    Authorization: `Bearer ${bearer}`,
    Accept: 'application/json',
  };
}

export async function fetchStewardInsights(opts: FetchInsightsOptions): Promise<StewardInsightsResponse> {
  const base = opts.analystOrigin.replace(/\/$/, '');
  const params = new URLSearchParams();
  if (opts.periodStart) params.set('period_start', opts.periodStart);
  if (opts.periodEnd) params.set('period_end', opts.periodEnd);
  const qs = params.toString();
  const url = `${base}/v1/steward/insights${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, { method: 'GET', headers: authHeaders(opts.bearer) });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`steward insights ${res.status}: ${text}`);
  }

  const body = (await res.json()) as StewardInsightsResponse | { ok: false; error: string };
  if ('ok' in body && body.ok === false) {
    throw new Error(`steward insights: ${body.error}`);
  }
  return body as StewardInsightsResponse;
}

export async function saveStewardReport(opts: {
  analystOrigin: string;
  bearer: string;
  period_start: string;
  period_end: string;
  report_markdown: string;
  run_id?: string;
  agent_id?: string;
}): Promise<void> {
  const base = opts.analystOrigin.replace(/\/$/, '');
  const res = await fetch(`${base}/v1/steward/reports`, {
    method: 'POST',
    headers: {
      ...authHeaders(opts.bearer),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      period_start: opts.period_start,
      period_end: opts.period_end,
      report_markdown: opts.report_markdown,
      run_id: opts.run_id,
      agent_id: opts.agent_id,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`steward report save ${res.status}: ${text}`);
  }
}
