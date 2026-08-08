import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';
import type { GmcFeedRow, SheetsConfig } from './types.js';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function loadServiceAccountJson(): string {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) return inline;

  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!path) {
    throw new Error(
      'Missing Google credentials: set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS',
    );
  }

  return readFileSync(path, 'utf8');
}

async function getAccessToken(): Promise<string> {
  const json = loadServiceAccountJson();
  const credentials = JSON.parse(json) as {
    client_email: string;
    private_key: string;
  };

  const auth = new GoogleAuth({
    credentials,
    scopes: [SHEETS_SCOPE],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error('Failed to obtain Google access token');
  }
  return token.token;
}

async function sheetsFetch(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

export async function clearSheetRange(config: SheetsConfig): Promise<void> {
  const response = await sheetsFetch(
    `${config.spreadsheetId}/values/${encodeURIComponent(config.clearRange)}:clear`,
    { method: 'POST', body: '{}' },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sheets clear failed HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
}

export function rowsToSheetValues(
  columns: string[],
  rows: GmcFeedRow[],
): string[][] {
  const header = columns;
  const data = rows.map((row) =>
    columns.map((col) => String(row[col as keyof GmcFeedRow] ?? '')),
  );
  return [header, ...data];
}

export async function writeFeedRows(
  config: SheetsConfig,
  columns: string[],
  rows: GmcFeedRow[],
): Promise<number> {
  const values = rowsToSheetValues(columns, rows);
  await clearSheetRange(config);

  const range = encodeURIComponent(config.writeRange);
  const response = await sheetsFetch(
    `${config.spreadsheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: 'PUT',
      body: JSON.stringify({ values }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sheets update failed HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  return rows.length;
}
