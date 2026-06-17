import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { d1Query } from './cloudflare-d1.js';
import {
  D1_DATABASES,
  flowMapExcerpt,
  resolveEnv,
  sampleColumnsFor,
  type D1DatabaseKey,
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
      const legacyKey = resolveEnv('EPIR_OPERATOR_PANEL_SECRET');
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (legacyKey) headers['X-Admin-Key'] = legacyKey;
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

  server.tool(
    'warehouse_probe',
    'Sonda wyłącznie Q1_CONVERSION_CHAT (analyst-worker HTTP lub batch RPC — przez origin env).',
    {},
    async () => {
      const origin = resolveEnv('EPIR_ANALYST_WORKER_ORIGIN');
      const bearer = resolveEnv('ANALYST_HTTP_BEARER');
      if (!origin || !bearer) {
        return textResult(
          'Opcjonalnie: EPIR_ANALYST_WORKER_ORIGIN + ANALYST_HTTP_BEARER. Alternatywa: flow_health_summary (Q1 w workerze).',
        );
      }
      const res = await fetch(`${origin.replace(/\/$/, '')}/v1/warehouse/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ queryId: 'Q1_CONVERSION_CHAT' }),
      });
      const text = await res.text();
      return textResult(`HTTP ${res.status}\n${text}`);
    },
  );

  return server;
}

export async function runStdioServer(): Promise<void> {
  const server = createDataOpsMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
