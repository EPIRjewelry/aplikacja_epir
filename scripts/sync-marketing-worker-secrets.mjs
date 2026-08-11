#!/usr/bin/env node
/**
 * Sync wybranych sekretów z root .dev.vars → wrangler secrets (marketing-ingest).
 * Bez nowych nazw — tylko istniejące klucze repo.
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const dir = dirname(fileURLToPath(import.meta.url));
const devVarsPath = join(dir, '../.dev.vars');
const workerDir = join(dir, '../workers/marketing-ingest');

const KEYS = [
  'SHOPIFY_ADMIN_TOKEN',
  'SHOP',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
  'MARKETING_OPS_PREVIEW_KEY',
];

const devVarPaths = [
  join(dir, '../.dev.vars'),
  join(dir, '../workers/marketing-ingest/.dev.vars'),
  join(dir, '../workers/chat/.dev.vars'),
];

function loadDevVars() {
  const out = {};
  for (const p of devVarPaths) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      const k = t.slice(0, i).trim();
      if (!out[k]) out[k] = v;
    }
  }
  return out;
}

const vars = loadDevVars();
const aliases = {
  SHOPIFY_ADMIN_TOKEN: ['SHOPIFY_ADMIN_ACCESS_TOKEN', 'SHOPIFY_ADMIN_API_TOKEN'],
};

const results = [];
for (const key of KEYS) {
  let value = vars[key]?.trim();
  if (!value && aliases[key]) {
    for (const alt of aliases[key]) {
      if (vars[alt]?.trim()) {
        value = vars[alt].trim();
        break;
      }
    }
  }
  if (!value) {
    results.push({ key, status: 'skip', reason: 'not in .dev.vars' });
    continue;
  }
  const proc = spawnSync('npx', ['wrangler', 'secret', 'put', key], {
    cwd: workerDir,
    input: `${value}\n`,
    encoding: 'utf8',
    shell: true,
  });
  results.push({
    key,
    status: proc.status === 0 ? 'ok' : 'fail',
    stderr: proc.stderr?.slice(0, 200),
  });
}

console.log(JSON.stringify(results, null, 2));
