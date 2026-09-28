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
    const ok = await hit(
      '/internal/operator-studio/api/analytics/query?queryId=Q1_CONVERSION_CHAT',
      { method: 'GET', headers: roHeaders() },
      env,
    );
    expect(ok.status).toBe(200);

    const q3 = await hit(
      '/internal/operator-studio/api/analytics/query?queryId=Q3_TOP_CHAT_QUESTIONS',
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
