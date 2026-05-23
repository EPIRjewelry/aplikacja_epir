import { D1_DATABASES, type D1DatabaseKey } from './config.js';

export async function d1Query(
  accountId: string,
  apiToken: string,
  databaseKey: D1DatabaseKey,
  sql: string,
): Promise<unknown> {
  const db = D1_DATABASES[databaseKey];
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${db.id}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    },
  );
  const body = (await res.json()) as { success?: boolean; errors?: unknown[]; result?: unknown[] };
  if (!res.ok || !body.success) {
    throw new Error(`D1 API error: ${JSON.stringify(body.errors ?? body).slice(0, 400)}`);
  }
  return body.result;
}
