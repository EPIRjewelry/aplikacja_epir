import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const fp = (v) => {
  if (!v) return null;
  const t = String(v).trim();
  return {
    len: t.length,
    sha8: createHash('sha256').update(t).digest('hex').slice(0, 8),
    last4: t.slice(-4),
  };
};

const proc = process.env.CLOUDFLARE_API_TOKEN;
const acct = process.env.CLOUDFLARE_ACCOUNT_ID || '73283c24dc79f92edef30dcdbc98f230';

function winEnv(scope, name) {
  const cmd = `[Environment]::GetEnvironmentVariable('${name}','${scope}')`;
  try {
    return execFileSync('powershell', ['-NoProfile', '-Command', cmd], {
      encoding: 'utf8',
    }).trim() || null;
  } catch {
    return null;
  }
}

const user = winEnv('User', 'CLOUDFLARE_API_TOKEN');
const machine = winEnv('Machine', 'CLOUDFLARE_API_TOKEN');
const hashes = new Set(
  [proc, user, machine]
    .filter(Boolean)
    .map((x) => createHash('sha256').update(String(x).trim()).digest('hex').slice(0, 8)),
);

console.log(
  JSON.stringify(
    {
      fingerprints: { process: fp(proc), user: fp(user), machine: fp(machine) },
      accountId: acct,
      uniqueTokenCount: hashes.size,
      tokenSourcesAligned: hashes.size <= 1,
    },
    null,
    2,
  ),
);

if (!proc?.trim()) {
  console.log('NO_PROCESS_TOKEN');
  process.exit(2);
}

const h = { Authorization: `Bearer ${proc.trim()}` };
const v = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
  headers: h,
}).then((r) => r.json());
const kv = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${acct}/storage/kv/namespaces`,
  { headers: h },
).then(async (r) => ({
  status: r.status,
  errors: (await r.json().catch(() => ({}))).errors,
}));
const scr = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${acct}/workers/scripts`,
  { headers: h },
).then(async (r) => ({
  status: r.status,
  errors: (await r.json().catch(() => ({}))).errors,
}));
const ns = '79b8871d6e664440b648308ee9493d6d';
const kvPut = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${acct}/storage/kv/namespaces/${ns}/values/__probe__`,
  { method: 'PUT', headers: { ...h, 'Content-Type': 'text/plain' }, body: 'ok' },
).then(async (r) => ({
  status: r.status,
  errors: (await r.json().catch(() => ({}))).errors,
}));

console.log(
  JSON.stringify(
    {
      verify: { ok: v.success, tokenId: v.result?.id },
      kv_namespaces: kv,
      workers_scripts: scr,
      kv_put_policies_cache: kvPut,
    },
    null,
    2,
  ),
);
