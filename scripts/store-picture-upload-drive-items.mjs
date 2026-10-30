#!/usr/bin/env node
/**
 * Upload tmp/drive-items/*.json via Google Drive API using gcloud ADC or GOOGLE_APPLICATION_CREDENTIALS.
 * Fallback: prints instructions if no auth.
 */
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const itemsDir = join(dir, '../tmp/drive-items');

async function getAccessToken() {
  const res = await fetch(
    'http://127.0.0.1:8085?scopes=https://www.googleapis.com/auth/drive.file',
    { method: 'GET' },
  ).catch(() => null);
  if (res?.ok) {
    const t = await res.text();
    if (t) return t.trim();
  }
  const { GoogleAuth } = await import('google-auth-library').catch(() => null);
  if (!GoogleAuth) return null;
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.file'] });
  const client = await auth.getClient();
  const tok = await client.getAccessToken();
  return tok.token ?? null;
}

async function uploadMultipart(meta, content, token) {
  const boundary = '-------epir_boundary';
  const metadata = JSON.stringify(meta);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${meta.mimeType || 'text/plain'}\r\n\r\n${content}\r\n` +
    `--${boundary}--`;
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`upload ${meta.name}: ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const token = await getAccessToken();
if (!token) {
  console.error(
    'Brak tokenu Drive (google-auth-library / ADC). Użyj MCP create_file lub ustaw GOOGLE_APPLICATION_CREDENTIALS.',
  );
  process.exit(2);
}

const results = [];
for (const file of readdirSync(itemsDir).sort()) {
  const item = JSON.parse(readFileSync(join(itemsDir, file), 'utf8'));
  const meta = {
    name: item.title,
    parents: [item.parentId],
    mimeType: item.targetMimeType || undefined,
  };
  const mimeForBody = item.contentMimeType || 'text/plain';
  const uploaded = await uploadMultipart({ ...meta, mimeType: meta.mimeType || mimeForBody }, item.textContent, token);
  results.push(uploaded);
  console.log(uploaded.webViewLink || uploaded.id);
}
console.log(JSON.stringify({ count: results.length }, null, 2));
