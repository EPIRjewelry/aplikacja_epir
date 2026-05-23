import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  authStatus,
  exchangeCodeForRefreshToken,
  getAuthorizationUrl,
  resolveOAuthConfig,
  revokeLocalAuth,
} from './auth/oauth.js';
import { GWorkspaceClient } from './google/client.js';

const fileIdSchema = z
  .string()
  .min(10)
  .describe('ID pliku Google (Docs, Sheets lub Drive) — z URL lub udostępnienia');

function textResult(body: string) {
  return { content: [{ type: 'text' as const, text: body }] };
}

async function withClient<T>(fn: (c: GWorkspaceClient) => Promise<T>): Promise<T> {
  const client = await GWorkspaceClient.create();
  return fn(client);
}

export function createGWorkspaceMcpServer(): McpServer {
  const server = new McpServer({
    name: 'epir-gworkspace',
    version: '0.1.0',
  });

  server.tool(
    'gworkspace_auth_status',
    'Sprawdza konfigurację OAuth (lokalny keychain / env). Nie zwraca sekretów.',
    {},
    async () => {
      const status = await authStatus();
      return textResult(JSON.stringify(status, null, 2));
    },
  );

  server.tool(
    'gworkspace_auth_url',
    'Zwraca URL autoryzacji Google (jednorazowo, token trafia do OS keychain).',
    {},
    async () => {
      const config = resolveOAuthConfig();
      if (!config) {
        return textResult(
          'Brak GWORKSPACE_OAUTH_CLIENT_ID / GWORKSPACE_OAUTH_CLIENT_SECRET w środowisku MCP.',
        );
      }
      return textResult(getAuthorizationUrl(config));
    },
  );

  server.tool(
    'gworkspace_auth_exchange_code',
    'Wymienia kod OAuth na refresh token i zapisuje w keychain.',
    { code: z.string().min(4) },
    async ({ code }) => {
      const config = resolveOAuthConfig();
      if (!config) {
        return textResult('Brak konfiguracji OAuth.');
      }
      await exchangeCodeForRefreshToken(config, code);
      return textResult('Refresh token zapisany w OS keychain (epir-mcp-gworkspace).');
    },
  );

  server.tool(
    'gworkspace_auth_revoke_local',
    'Usuwa lokalny refresh token z keychain (nie revoke u Google).',
    {},
    async () => {
      await revokeLocalAuth();
      return textResult('Lokalny token usunięty.');
    },
  );

  server.tool(
    'gdrive_get_metadata',
    'Metadane pliku Drive po ID (bez skanowania całego Dysku).',
    { fileId: fileIdSchema },
    async ({ fileId }) => {
      const meta = await withClient((c) => c.getFileMetadata(fileId));
      return textResult(JSON.stringify(meta, null, 2));
    },
  );

  server.tool(
    'gdocs_read_markdown',
    'Google Docs → Markdown (token-optimized). Wymaga fileId dokumentu.',
    {
      fileId: fileIdSchema,
      maxChars: z.number().int().positive().optional(),
    },
    async ({ fileId, maxChars }) => {
      const out = await withClient((c) => c.readDocAsMarkdown(fileId, maxChars));
      const header = [
        `<!-- ${out.meta.name} | ${out.meta.mimeType} -->`,
        out.truncated
          ? `<!-- truncated: ${out.originalLength} chars → window ${maxChars ?? 'default'} -->`
          : '',
        '',
      ].join('\n');
      return textResult(header + out.markdown);
    },
  );

  server.tool(
    'gsheets_read_csv',
    'Google Sheets → CSV (zakres A1). Wymaga spreadsheetId.',
    {
      spreadsheetId: fileIdSchema,
      range: z.string().default('Sheet1').describe('Zakres A1, np. Sheet1!A1:Z500'),
      maxChars: z.number().int().positive().optional(),
    },
    async ({ spreadsheetId, range, maxChars }) => {
      const out = await withClient((c) => c.readSheetAsCsv(spreadsheetId, range, maxChars));
      const header = [
        `<!-- ${out.meta.name} | range=${range} -->`,
        out.truncated ? `<!-- truncated: ${out.originalLength} chars -->` : '',
        '',
      ].join('\n');
      return textResult(header + out.csv);
    },
  );

  server.tool(
    'gdrive_export_text',
    'Tworzy plik tekstowy na Dysku (most async obok trigger-warehouse-export).',
    {
      name: z.string().min(1),
      content: z.string(),
      mimeType: z.string().optional(),
      parentFolderId: z.string().optional(),
    },
    async ({ name, content, mimeType, parentFolderId }) => {
      const meta = await withClient((c) =>
        c.createTextFile({ name, content, mimeType, parentFolderId }),
      );
      return textResult(JSON.stringify(meta, null, 2));
    },
  );

  return server;
}

export async function runStdioServer(): Promise<void> {
  const server = createGWorkspaceMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
