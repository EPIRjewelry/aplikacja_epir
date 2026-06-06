/**
 * CF token provenance audit — debug session c5f9ea
 * Never logs full tokens; only length + sha256 prefix.
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const LOG_PATH = resolve(process.cwd(), 'debug-c5f9ea.log');
const SESSION_ID = 'c5f9ea';
const RUN_ID = process.env.DEBUG_RUN_ID || `audit-${Date.now()}`;
const ENDPOINT =
  'http://127.0.0.1:7457/ingest/49605965-4d1e-4f49-8545-82fd58eedfca';

function fp(value) {
  if (value == null || value === '') return { present: false };
  const s = String(value);
  const trimmed = s.trim();
  return {
    present: true,
    length: s.length,
    trimmedLength: trimmed.length,
    hasLeadingWhitespace: s.length > 0 && s[0] !== trimmed[0],
    hasTrailingWhitespace: trimmed.length > 0 && s !== trimmed,
    hasQuotes:
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'")),
    sha8: createHash('sha256').update(trimmed).digest('hex').slice(0, 8),
    last4: trimmed.length >= 4 ? trimmed.slice(-4) : '****',
  };
}

function log(hypothesisId, location, message, data = {}) {
  const entry = {
    sessionId: SESSION_ID,
    runId: RUN_ID,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
  fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': SESSION_ID,
    },
    body: JSON.stringify(entry),
  }).catch(() => {});
}

function readWindowsEnv(scope) {
  try {
    const ps = `[Environment]::GetEnvironmentVariable('CLOUDFLARE_API_TOKEN','${scope}')`;
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', ps],
      { encoding: 'utf8' },
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

function readWindowsAccount(scope) {
  try {
    const ps = `[Environment]::GetEnvironmentVariable('CLOUDFLARE_ACCOUNT_ID','${scope}')`;
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', ps],
      { encoding: 'utf8' },
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

function scanEnvFiles() {
  const candidates = [
    '.env',
    '.env.local',
    'workers/chat/.env',
    'workers/chat/.env.local',
    'apps/kazka/.dev.vars',
  ].map((p) => resolve(process.cwd(), p));
  const hits = [];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    const hasCfToken = /CLOUDFLARE_API_TOKEN\s*=/.test(text);
    const hasCfAccount = /CLOUDFLARE_ACCOUNT_ID\s*=/.test(text);
    if (hasCfToken || hasCfAccount) {
      hits.push({ path: p, hasCfToken, hasCfAccount });
    }
  }
  return hits;
}

function wranglerWhoami() {
  const r = spawnSync(
    'npx',
    ['wrangler', 'whoami'],
    {
      cwd: resolve(process.cwd(), 'workers/chat'),
      encoding: 'utf8',
      shell: true,
      env: process.env,
    },
  );
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const usesEnvToken = /CLOUDFLARE_API_TOKEN environment variable/i.test(out);
  const usesOAuth = /logged in with an OAuth Token/i.test(out);
  const accountMatch = out.match(
    /([0-9a-f]{32})\s*│\s*$/im,
  );
  const accountId =
    out.match(/│\s*([0-9a-f]{32})\s*│/i)?.[1] ||
    out.match(/Account ID\s+([0-9a-f]{32})/i)?.[1] ||
    null;
  return {
    exitCode: r.status ?? 1,
    usesEnvToken,
    usesOAuth,
    accountId,
    snippet: out.split('\n').slice(0, 12).join('\n'),
  };
}

async function verifyTokenWithCfApi(token, accountId) {
  if (!token?.trim()) return { skipped: true };
  const headers = {
    Authorization: `Bearer ${token.trim()}`,
    'Content-Type': 'application/json',
  };
  const verifyRes = await fetch(
    'https://api.cloudflare.com/client/v4/user/tokens/verify',
    { headers },
  );
  const verifyJson = await verifyRes.json().catch(() => ({}));
  let kvStatus = null;
  let kvCode = null;
  if (accountId) {
    const kvRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`,
      { headers },
    );
    kvStatus = kvRes.status;
    const kvJson = await kvRes.json().catch(() => ({}));
    kvCode = kvJson?.errors?.[0]?.code ?? null;
  }
  return {
    verifyStatus: verifyRes.status,
    verifyOk: verifyJson?.success === true,
    verifyId: verifyJson?.result?.id ?? null,
    kvListStatus: kvStatus,
    kvListCode: kvCode,
  };
}

// --- run audit ---
log('INIT', 'cf-token-audit.mjs:main', 'audit_start', {
  cwd: process.cwd(),
  node: process.version,
});

const processToken = process.env.CLOUDFLARE_API_TOKEN;
const processAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
const userToken = readWindowsEnv('User');
const machineToken = readWindowsEnv('Machine');
const userAccount = readWindowsAccount('User');
const machineAccount = readWindowsAccount('Machine');

log('A', 'env:process', 'process_env_fingerprint', {
  token: fp(processToken),
  accountId: processAccount || null,
});

log('A', 'env:user', 'user_env_fingerprint', {
  token: fp(userToken),
  accountId: userAccount || null,
});

log('A', 'env:machine', 'machine_env_fingerprint', {
  token: fp(machineToken),
  accountId: machineAccount || null,
});

const mismatches = [];
if (processToken && userToken) {
  const p = fp(processToken).sha8;
  const u = fp(userToken).sha8;
  if (p && u && p !== u) mismatches.push('process_vs_user_token');
}
if (processToken && machineToken) {
  const p = fp(processToken).sha8;
  const m = fp(machineToken).sha8;
  if (p && m && p !== m) mismatches.push('process_vs_machine_token');
}
if (userToken && machineToken) {
  const u = fp(userToken).sha8;
  const m = fp(machineToken).sha8;
  if (u && m && u !== m) mismatches.push('user_vs_machine_token');
}

log('A', 'env:compare', 'token_source_mismatch', { mismatches });

const envFiles = scanEnvFiles();
log('B', 'env:files', 'dotenv_candidates', { envFiles });

const wranglerConfig = join(homedir(), '.wrangler', 'config', 'default.toml');
log('C', 'wrangler:config', 'oauth_config_exists', {
  path: wranglerConfig,
  exists: existsSync(wranglerConfig),
});

const whoami = wranglerWhoami();
log('C', 'wrangler:whoami', 'wrangler_auth_mode', whoami);

const accountForApi =
  processAccount || userAccount || machineAccount || whoami.accountId;
const apiCheck = await verifyTokenWithCfApi(processToken, accountForApi);
log('D', 'cf:api', 'direct_api_verify_and_kv_list', {
  accountUsed: accountForApi,
  ...apiCheck,
});

// Test with ONLY user token if different from process
if (userToken && fp(userToken).sha8 !== fp(processToken).sha8) {
  const userApi = await verifyTokenWithCfApi(userToken, accountForApi);
  log('A', 'cf:api', 'user_token_direct_api', userApi);
}

log('E', 'wrangler:cache', 'wrangler_cache_paths', {
  chatCache: existsSync(
    resolve(process.cwd(), 'node_modules/.cache/wrangler'),
  ),
  rootCache: existsSync(resolve(process.cwd(), 'workers/chat/node_modules/.cache/wrangler')),
});

console.log(`CF token audit complete. Logs: ${LOG_PATH}`);
console.log(`Run ID: ${RUN_ID}`);
console.log(`Token mismatches: ${mismatches.length ? mismatches.join(', ') : 'none detected'}`);
console.log(`Process token fingerprint: sha8=${fp(processToken).sha8 ?? 'n/a'} last4=${fp(processToken).last4 ?? 'n/a'}`);
console.log(`User env token fingerprint: sha8=${fp(userToken).sha8 ?? 'n/a'} last4=${fp(userToken).last4 ?? 'n/a'}`);
console.log(`Machine env token: ${machineToken ? 'set' : 'not set'}`);
console.log(`Wrangler auth: envToken=${whoami.usesEnvToken} oauth=${whoami.usesOAuth}`);
console.log(`Cloudflare token id (verify API): ${apiCheck.verifyId ?? 'n/a'}`);
console.log(`API verify ok=${apiCheck.verifyOk} KV list HTTP=${apiCheck.kvListStatus} code=${apiCheck.kvListCode}`);
console.log(
  'Interpretacja: verify=ok + KV=401/10000 => używany token jest aktywny, ale BEZ uprawnień KV na tym koncie (albo inny token w Dashboard niż w Windows User env).',
);
