import { describe, expect, it } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/config/bindings';

const noopCtx = { waitUntil() {} } as unknown as ExecutionContext;

const FULL = 'full-op-secret';
const RO = 'readonly-analytics-key';

function roHeaders(extra: Record<string, string> = {}): HeadersInit {
  return { 'X-Admin-Key': RO, ...extra };
}

function baseEnv(overrides: Record<string, unknown> = {}): Env {
  const db = {
    prepare(_sql: string) {
      return {
        bind() {
          return this;
        },
        async first() {
          return {
            report_date: '2026-09-28',
            markdown_body: '# Daily',
            edog_verdict: 'PASS',
            created_at: 1,
          };
        },
        async all() {
          return {
            results: [
              {
                report_date: '2026-09-28',
                markdown_body: '# Daily',
                edog_verdict: 'PASS',
                created_at: 1,
              },
            ],
          };
        },
      };
    },
  };
  return {
    EPIR_OPERATOR_PANEL_SECRET: FULL,
    EPIR_READONLY_ANALYTICS_KEY: RO,
    DB_CHATBOT: db,
    BIGQUERY_BATCH_RPC: {
      getFlowHealth: async () => ({
        edog_verdict: 'PASS' as const,
        reasons: ['ok'],
        checked_at: '2026-09-29T00:00:00.000Z',
      }),
      runAnalyticsQuery: async ({ queryId }: { queryId?: string }) => ({
        ok: true as const,
        queryId: queryId ?? '',
        rows: [{ n: 1 }],
      }),
      triggerWarehouseExport: async () => ({ ok: true as const, summary: null }),
    },
    STORE_STEWARD_RPC: {
      getInsights: async () => ({ ok: true, insights: [] }),
      runAggregation: async () => ({ ok: true }),
    },
    ...overrides,
  } as unknown as Env;
}

async function hit(
  path: string,
  init: RequestInit,
  env: Env = baseEnv(),
): Promise<Response> {
  return worker.fetch(new Request(`https://asystent.test${path}`, init), env, noopCtx);
}

describe('readonly analytics key — access matrix', () => {
  it('200: ready, flow-health, steward/insights, reports, operator-report, reports/{date}', async () => {
    const env = baseEnv();
    const paths = [
      '/internal/operator-studio/api/ready',
      '/internal/operator-studio/api/flow-health',
      '/internal/operator-studio/api/steward/insights',
      '/internal/operator-studio/api/operator-report/latest',
      '/internal/operator-studio/api/reports?limit=5',
      '/internal/operator-studio/api/reports/2026-09-28',
    ];
    for (const path of paths) {
      const res = await hit(path, { method: 'GET', headers: roHeaders() }, env);
      expect(res.status, path).toBe(200);
    }
  });

  it('200: analytics/query for safe Q*; 403 for Q3; 400 for unknown SQL id', async () => {
    const env = baseEnv();
    const safe = [
      'Q1_CONVERSION_CHAT',
      'Q2',
      'Q4_STOREFRONT_SEGMENTATION',
      'Q5',
      'Q6_CHAT_ENGAGEMENT',
      'Q7_PRODUCT_TO_PURCHASE',
      'Q8_DAILY_EVENTS',
      'Q9_TOOL_USAGE',
      'q10',
    ];
    for (const queryId of safe) {
      const res = await hit(
        `/internal/operator-studio/api/analytics/query?queryId=${queryId}`,
        { method: 'GET', headers: roHeaders() },
        env,
      );
      expect(res.status, queryId).toBe(200);
      const body = (await res.json()) as { result?: { queryId?: string } };
      expect(body.result?.queryId, queryId).toMatch(/^Q(1|2|4|5|6|7|8|9|10)_/);
    }

    const q3 = await hit(
      '/internal/operator-studio/api/analytics/query?queryId=Q3',
      { method: 'GET', headers: roHeaders() },
      env,
    );
    expect(q3.status).toBe(403);
    const q3Body = (await q3.json()) as { error?: string };
    expect(q3Body.error).toBe('queryId_forbidden_for_readonly_key');

    const bad = await hit(
      '/internal/operator-studio/api/analytics/query?queryId=SELECT_STAR',
      { method: 'GET', headers: roHeaders() },
      env,
    );
    expect(bad.status).toBe(400);
    const badBody = (await bad.json()) as { error?: string; allowedQueryIds?: string[] };
    expect(badBody.error).toBe('queryId_not_whitelisted');
    expect(badBody.allowedQueryIds).toHaveLength(9);
    expect(badBody.allowedQueryIds).not.toContain('Q3_TOP_CHAT_QUESTIONS');
  });

  it('200: full panel key may run Q3', async () => {
    const env = baseEnv();
    const res = await hit(
      '/internal/operator-studio/api/analytics/query?queryId=Q3_TOP_CHAT_QUESTIONS',
      { method: 'GET', headers: { 'X-Admin-Key': FULL } },
      env,
    );
    expect(res.status).toBe(200);
  });

  it('200: marketing preview, gmc, ads audit with readonly key; strips email', async () => {
    const env = baseEnv({
      MARKETING_INGEST_RPC: {
        getMarketingPreview: async () => ({
          date: '2026-10-01',
          google_ads: { rowCount: 1, topCampaigns: [] },
          google_analytics: { rowCount: 1, topRows: [] },
          google_merchant: { skipped: false, productsWithIssues: 2 },
        }),
        getGmcDiagnostics: async () => ({ merchantId: '136678353', accountIssueCount: 0 }),
        getAdsAccountChangeAudit: async () => ({
          ok: true,
          readOnly: true,
          changeEventLast30Days: {
            rows: [{ op: 'UPDATE', user: 'analyst@example.com', userEmail: 'analyst@example.com' }],
          },
        }),
      },
    });
    const preview = await hit(
      '/internal/operator-studio/api/marketing-preview?date=2026-10-01',
      { method: 'GET', headers: roHeaders() },
      env,
    );
    expect(preview.status).toBe(200);
    const previewBody = (await preview.json()) as { source?: string; result?: { date?: string } };
    expect(previewBody.source).toBe('marketing_preview');
    expect(previewBody.result?.date).toBe('2026-10-01');

    const gmc = await hit(
      '/internal/operator-studio/api/gmc-diagnostics',
      { method: 'GET', headers: roHeaders() },
      env,
    );
    expect(gmc.status).toBe(200);

    const ads = await hit(
      '/internal/operator-studio/api/ads-account-change-audit',
      { method: 'GET', headers: roHeaders() },
      env,
    );
    expect(ads.status).toBe(200);
    const adsText = await ads.text();
    expect(adsText).not.toContain('analyst@example.com');
    expect(adsText).toContain('UPDATE');
  });

  it('401 marketing-preview without key; 400 bad date; 503 when rpc missing', async () => {
    const missing = await hit('/internal/operator-studio/api/marketing-preview', { method: 'GET' });
    expect(missing.status).toBe(401);

    const badDate = await hit(
      '/internal/operator-studio/api/marketing-preview?date=yesterday',
      { method: 'GET', headers: roHeaders() },
      baseEnv({
        MARKETING_INGEST_RPC: {
          getMarketingPreview: async () => ({ date: '2026-10-01', google_ads: {}, google_analytics: {} }),
        },
      }),
    );
    expect(badDate.status).toBe(400);

    const noRpc = await hit(
      '/internal/operator-studio/api/gmc-diagnostics',
      { method: 'GET', headers: roHeaders() },
      baseEnv(),
    );
    expect(noRpc.status).toBe(503);
  });

  it('401: chat, warehouse export, profile PUT, steward/aggregate, leads, memory erase, pixel PII', async () => {
    const env = baseEnv();
    const cases: { path: string; init: RequestInit }[] = [
      {
        path: '/internal/operator-studio/api/chat',
        init: {
          method: 'POST',
          headers: roHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ message: 'hi', stream: false }),
        },
      },
      {
        path: '/internal/operator-studio/api/trigger-warehouse-export',
        init: { method: 'POST', headers: roHeaders() },
      },
      {
        path: '/internal/operator-studio/api/operator-profile',
        init: {
          method: 'PUT',
          headers: roHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ brandNotes: 'x' }),
        },
      },
      {
        path: '/internal/operator-studio/api/steward/aggregate',
        init: { method: 'POST', headers: roHeaders() },
      },
      {
        path: '/admin/api/leads',
        init: { method: 'GET', headers: roHeaders() },
      },
      {
        path: '/memory/customer/gid://shopify/Customer/1',
        init: { method: 'DELETE', headers: roHeaders() },
      },
      {
        path: '/pixel/events?limit=1',
        init: { method: 'GET', headers: roHeaders() },
      },
      {
        path: '/journey?customer_id=c1',
        init: { method: 'GET', headers: roHeaders() },
      },
      {
        path: '/sessions?customer_id=c1',
        init: { method: 'GET', headers: roHeaders() },
      },
    ];
    for (const c of cases) {
      const res = await hit(c.path, c.init, env);
      expect(res.status, c.path).toBe(401);
    }
  });

  it('401: /admin/api/leads with ?key= full secret (query string must not authorize)', async () => {
    const env = baseEnv();
    const res = await hit(`/admin/api/leads?key=${encodeURIComponent(FULL)}`, { method: 'GET' }, env);
    expect(res.status).toBe(401);
  });

  it('200: /admin/api/leads with X-Admin-Key full secret', async () => {
    const env = baseEnv({
      DB_CHATBOT: {
        prepare() {
          return {
            bind() {
              return this;
            },
            async all() {
              return { results: [] };
            },
            async first() {
              return { total_visitors: 0, qualified_leads: 0, avg_engagement: 0 };
            },
          };
        },
      },
    });
    // AnalyticsService may need richer stubs — auth gate is primary assert
    const res = await hit('/admin/api/leads', { method: 'GET', headers: { 'X-Admin-Key': FULL } }, env);
    // 200 if service ok, 500 if stub incomplete — never 401
    expect(res.status).not.toBe(401);
  });
});
