/**
 * Compares canonical secret names vs wrangler secret list + Pages API.
 * Prints ONLY names still missing (one per line).
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '73283c24dc79f92edef30dcdbc98f230';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();

const WORKERS = [
  {
    dir: 'workers/chat',
    required: [
      'AI_GATEWAY_TOKEN',
      'SHOPIFY_APP_SECRET',
      'SHOPIFY_STOREFRONT_TOKEN',
      'SHOPIFY_ADMIN_TOKEN',
      'OPENROUTER_API_KEY',
    ],
  },
  {
    dir: 'workers/bigquery-batch',
    required: ['R2_SQL_API_TOKEN'],
  },
  {
    dir: 'workers/rag-worker',
    required: ['ADMIN_TOKEN'],
  },
];

const PAGES = [
  {
    project: 'kazka-hydrogen-pages',
    required: [
      'SESSION_SECRET',
      'PUBLIC_STOREFRONT_API_TOKEN',
      'PRIVATE_STOREFRONT_API_TOKEN',
      'PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID',
    ],
  },
  {
    project: 'zareczyny-hydrogen-pages',
    required: [
      'SESSION_SECRET',
      'PUBLIC_STOREFRONT_API_TOKEN',
      'PRIVATE_STOREFRONT_API_TOKEN',
      'PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID',
    ],
  },
];

function listWorkerSecrets(cwd) {
  const r = spawnSync('npx', ['wrangler', 'secret', 'list'], {
    cwd: resolve(process.cwd(), cwd),
    encoding: 'utf8',
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) return null;
  try {
    const arr = JSON.parse(r.stdout);
    return new Set(arr.map((x) => x.name));
  } catch {
    return new Set();
  }
}

async function listPagesVars(project) {
  if (!TOKEN) return null;
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${project}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  if (!res.ok) return null;
  const json = await res.json();
  const prod = json.result?.deployment_configs?.production?.env_vars ?? {};
  const preview = json.result?.deployment_configs?.preview?.env_vars ?? {};
  const names = new Set([
    ...Object.keys(prod),
    ...Object.keys(preview),
  ]);
  return { names, prod, preview };
}

const missing = [];

// CF API token capability
if (TOKEN) {
  const kv = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/storage/kv/namespaces`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  if (!kv.ok) missing.push('CLOUDFLARE_API_TOKEN (Workers KV Storage Edit)');
} else {
  missing.push('CLOUDFLARE_API_TOKEN');
  missing.push('CLOUDFLARE_ACCOUNT_ID');
}

for (const w of WORKERS) {
  const have = listWorkerSecrets(w.dir);
  if (!have) {
    for (const n of w.required) missing.push(`${w.dir} → ${n} (secret list failed)`);
    continue;
  }
  for (const n of w.required) {
    if (!have.has(n)) missing.push(`${w.dir} → ${n}`);
  }
}

for (const p of PAGES) {
  const info = await listPagesVars(p.project);
  if (!info) {
    for (const n of p.required) missing.push(`${p.project} → ${n} (pages API failed)`);
    continue;
  }
  for (const n of p.required) {
    if (!info.names.has(n)) missing.push(`${p.project} → ${n}`);
    else {
      const prodVal = info.prod[n]?.value;
      const prevVal = info.preview[n]?.value;
      const prodEmpty = prodVal === undefined || prodVal === '';
      const prevEmpty = prevVal === undefined || prevVal === '';
      if (prodEmpty) missing.push(`${p.project} production → ${n}`);
      if (prevEmpty) missing.push(`${p.project} preview → ${n}`);
    }
  }
}

// MCP / local (only if unset in process env)
const localOptional = [
  'EPIR_CHAT_WORKER_ORIGIN',
  'EPIR_OPERATOR_PANEL_SECRET',
  'GWORKSPACE_OAUTH_CLIENT_ID',
  'GWORKSPACE_OAUTH_CLIENT_SECRET',
];
for (const n of localOptional) {
  if (!process.env[n]?.trim()) missing.push(`local env → ${n}`);
}

const unique = [...new Set(missing)];
for (const line of unique) console.log(line);
