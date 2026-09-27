/**
 * PUT kazka-meta-catalog.csv → R2 bucket epir-gmc-feed/kazka-meta-catalog.csv
 * Does not touch gmc_feed.csv. Uses CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID.
 *
 *   node scripts/upload-kazka-meta-catalog-r2.mjs
 *   KAZKA_META_CSV_PATH=D:/marketing/csv/kazka-meta-catalog.csv node ...
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadDevVars(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]?.trim()) process.env[k] = v;
  }
}
loadDevVars(join(repoRoot, '.dev.vars'));

const defaultPath = join(repoRoot, 'marketing', 'csv', 'kazka-meta-catalog.csv');
const filePath =
  process.env.KAZKA_META_CSV_PATH?.trim() ||
  (existsSync('D:/marketing/csv/kazka-meta-catalog.csv')
    ? 'D:/marketing/csv/kazka-meta-catalog.csv'
    : defaultPath);
const accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || '73283c24dc79f92edef30dcdbc98f230';
const bucket = 'epir-gmc-feed';
const key = 'kazka-meta-catalog.csv';
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();

if (!token) {
  console.error('CLOUDFLARE_API_TOKEN missing');
  process.exit(1);
}
if (!existsSync(filePath)) {
  console.error('CSV not found:', filePath);
  process.exit(1);
}

const body = readFileSync(filePath);
const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${key}`;
const res = await fetch(url, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'text/csv; charset=utf-8',
  },
  body,
});
const text = await res.text();
console.log(
  JSON.stringify(
    {
      ok: res.ok,
      status: res.status,
      bytes: body.length,
      source: filePath,
      key: `${bucket}/${key}`,
      body: text.slice(0, 400),
    },
    null,
    2,
  ),
);
process.exit(res.ok ? 0 : 1);
