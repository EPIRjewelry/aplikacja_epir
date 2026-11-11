import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { d1Query } from './cloudflare-d1.js';
import {
  D1_DATABASES,
  READONLY_WAREHOUSE_QUERY_IDS,
  flowMapExcerpt,
  resolveEnv,
  sampleColumnsFor,
  type D1DatabaseKey,
  type ReadonlyWarehouseQueryId,
} from './config.js';

function textResult(body: string) {
  return { content: [{ type: 'text' as const, text: body }] };
}

const dbKeySchema = z.enum(['jewelry_analytics', 'ai_assistant_sessions']);

export function createDataOpsMcpServer(): McpServer {
  const server = new McpServer({
    name: 'epir-data-ops',
    version: '0.1.0',
  });

  server.tool(
    'flow_health_summary',
    'GET /internal/operator-studio/api/flow-health (proxy RPC; Access cookie lub X-Admin-Key).',
    {},
    async () => {
      const origin =
        resolveEnv('EPIR_CHAT_WORKER_ORIGIN') ||
        resolveEnv('WORKER_ORIGIN') ||
        'https://asystent.epirbizuteria.pl';
      const readKey = resolveEnv('EPIR_READONLY_ANALYTICS_KEY');
      if (!readKey) {
        return textResult(
          'Brak EPIR_READONLY_ANALYTICS_KEY. MCP epir-data-ops działa tylko na kluczu tylko do odczytu — ustaw go w env (nie używaj EPIR_OPERATOR_PANEL_SECRET).',
        );
      }
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Admin-Key': readKey,
      };
      const res = await fetch(`${origin.replace(/\/$/, '')}/internal/operator-studio/api/flow-health`, {
        headers,
      });
      const text = await res.text();
      return textResult(`HTTP ${res.status}\n${text}`);
    },
  );

  server.tool(
    'flow_map_excerpt',
    'Fragment docs/EPIR_DATA_FLOW_MAP.md (grounding EDOG).',
    {},
    async () => textResult(flowMapExcerpt()),
  );

  server.tool(
    'd1_metadata',
    'PRAGMA table_info + COUNT(*) dla allowlisted tabeli (read-only).',
    {
      database: dbKeySchema,
      table: z.string().min(1),
    },
    async ({ database, table }) => {
      const accountId = resolveEnv('CLOUDFLARE_ACCOUNT_ID');
      const token = resolveEnv('CLOUDFLARE_API_TOKEN');
      if (!accountId || !token) {
        return textResult('Ustaw CLOUDFLARE_ACCOUNT_ID i CLOUDFLARE_API_TOKEN.');
      }
      const dbKey = database as D1DatabaseKey;
      const allowed = D1_DATABASES[dbKey].allowedTables as readonly string[];
      if (!allowed.includes(table)) {
        return textResult(`Tabela niedozwolona. Dozwolone: ${allowed.join(', ')}`);
      }
      const info = await d1Query(accountId, token, dbKey, `PRAGMA table_info(${table})`);
      const count = await d1Query(accountId, token, dbKey, `SELECT COUNT(*) AS cnt FROM ${table}`);
      return textResult(JSON.stringify({ table, info, count }, null, 2));
    },
  );

  server.tool(
    'd1_sample_rows',
    'LIMIT ≤5 wierszy — tylko kolumny bez payload/url (read-only).',
    {
      database: dbKeySchema,
      table: z.string().min(1),
      limit: z.number().int().min(1).max(5).optional(),
    },
    async ({ database, table, limit }) => {
      const accountId = resolveEnv('CLOUDFLARE_ACCOUNT_ID');
      const token = resolveEnv('CLOUDFLARE_API_TOKEN');
      if (!accountId || !token) {
        return textResult('Ustaw CLOUDFLARE_ACCOUNT_ID i CLOUDFLARE_API_TOKEN.');
      }
      const dbKey = database as D1DatabaseKey;
      const allowed = D1_DATABASES[dbKey].allowedTables as readonly string[];
      if (!allowed.includes(table)) {
        return textResult(`Tabela niedozwolona. Dozwolone: ${allowed.join(', ')}`);
      }
      const cols = sampleColumnsFor(table);
      if (!cols?.length) {
        return textResult('Brak zdefiniowanych kolumn próbki dla tej tabeli.');
      }
      const lim = limit ?? 5;
      const sql = `SELECT ${cols.join(', ')} FROM ${table} ORDER BY 1 DESC LIMIT ${lim}`;
      const rows = await d1Query(accountId, token, dbKey, sql);
      return textResult(JSON.stringify(rows, null, 2));
    },
  );

  async function getReadonlyOperatorStudio(pathAndQuery: string): Promise<string> {
    const origin =
      resolveEnv('EPIR_CHAT_WORKER_ORIGIN') ||
      resolveEnv('WORKER_ORIGIN') ||
      'https://asystent.epirbizuteria.pl';
    const readKey = resolveEnv('EPIR_READONLY_ANALYTICS_KEY');
    if (!readKey) {
      return (
        'Brak EPIR_READONLY_ANALYTICS_KEY. MCP epir-data-ops działa tylko na kluczu tylko do odczytu — ustaw go w env (nie używaj EPIR_OPERATOR_PANEL_SECRET).'
      );
    }
    const res = await fetch(`${origin.replace(/\/$/, '')}${pathAndQuery}`, {
      headers: {
        Accept: 'application/json',
        'X-Admin-Key': readKey,
      },
    });
    const text = await res.text();
    return `HTTP ${res.status}\n${text}`;
  }

  server.tool(
    'warehouse_probe',
    'Sonda wyłącznie Q1_CONVERSION_CHAT przez Operator Studio (EPIR_READONLY_ANALYTICS_KEY).',
    {},
    async () =>
      textResult(
        await getReadonlyOperatorStudio(
          '/internal/operator-studio/api/analytics/query?queryId=Q1_CONVERSION_CHAT',
        ),
      ),
  );

  server.tool(
    'warehouse_query',
    'Hurtownia R2 SQL — Q1–Q10 bez Q3 (treść wiadomości) przez Operator Studio i EPIR_READONLY_ANALYTICS_KEY. Skrót Q1 albo pełne queryId.',
    {
      queryId: z.enum(
        READONLY_WAREHOUSE_QUERY_IDS as unknown as [ReadonlyWarehouseQueryId, ...ReadonlyWarehouseQueryId[]],
      ),
    },
    async ({ queryId }) =>
      textResult(
        await getReadonlyOperatorStudio(
          `/internal/operator-studio/api/analytics/query?queryId=${encodeURIComponent(queryId)}`,
        ),
      ),
  );

  server.tool(
    'marketing_preview',
    'Agregaty GA4 + Google Ads + GMC (bez sekretów Google) przez Operator Studio. Ten sam EPIR_READONLY_ANALYTICS_KEY.',
    {
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD; domyślnie wczoraj UTC'),
    },
    async ({ date }) => {
      const q = date ? `?date=${encodeURIComponent(date)}` : '';
      return textResult(await getReadonlyOperatorStudio(`/internal/operator-studio/api/marketing-preview${q}`));
    },
  );

  server.tool(
    'gmc_diagnostics',
    'Diagnostyka Google Merchant (read-only) przez Operator Studio i EPIR_READONLY_ANALYTICS_KEY.',
    {},
    async () => textResult(await getReadonlyOperatorStudio('/internal/operator-studio/api/gmc-diagnostics')),
  );

  server.tool(
    'ads_account_change_audit',
    'Read-only audyt konta Ads (cele, budżet, change_event bez e-maili) przez Operator Studio. Bez mutacji kampanii.',
    {},
    async () =>
      textResult(await getReadonlyOperatorStudio('/internal/operator-studio/api/ads-account-change-audit')),
  );

  server.tool(
    'operator_report_excerpt',
    'Ostatni raport dzienny operatora (D1): data, EDOG, skrót markdown ≤3000 znaków — do briefu Kustosza.',
    {
      report_date: z.string().optional().describe('YYYY-MM-DD; domyślnie najnowszy'),
    },
    async ({ report_date }) => {
      const accountId = resolveEnv('CLOUDFLARE_ACCOUNT_ID');
      const token = resolveEnv('CLOUDFLARE_API_TOKEN');
      if (!accountId || !token) {
        return textResult('Ustaw CLOUDFLARE_ACCOUNT_ID i CLOUDFLARE_API_TOKEN.');
      }
      const date = report_date?.trim();
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return textResult('report_date musi być YYYY-MM-DD.');
      }
      const sql = date
        ? `SELECT report_date, edog_verdict, created_at, substr(markdown_body, 1, 3000) AS excerpt FROM operator_daily_reports WHERE report_date = '${date}' LIMIT 1`
        : `SELECT report_date, edog_verdict, created_at, substr(markdown_body, 1, 3000) AS excerpt FROM operator_daily_reports ORDER BY created_at DESC LIMIT 1`;
      const rows = await d1Query(accountId, token, 'ai_assistant_sessions', sql);
      return textResult(JSON.stringify(rows, null, 2));
    },
  );

  return server;
}

export async function runStdioServer(): Promise<void> {
  const server = createDataOpsMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
