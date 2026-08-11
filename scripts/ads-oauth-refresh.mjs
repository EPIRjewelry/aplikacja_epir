#!/usr/bin/env node
/**
 * Jednorazowy OAuth refresh z scope adwords + datamanager.
 * Zapisuje GOOGLE_ADS_REFRESH_TOKEN do root .dev.vars (i opcjonalnie na worker).
 *
 *   node scripts/ads-oauth-refresh.mjs
 *   node scripts/ads-oauth-refresh.mjs --push-worker
 */
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '..');
const devVarsPath = join(repoRoot, '.dev.vars');
const PORT = 8765;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/datamanager',
].join(' ');

function loadDevVars() {
  const paths = [
    devVarsPath,
    join(repoRoot, 'workers', 'marketing-ingest', '.dev.vars'),
    join(repoRoot, 'workers', 'chat', '.dev.vars'),
  ];
  const out = {};
  for (const p of paths) {
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

function upsertDevVar(key, value) {
  let lines = existsSync(devVarsPath) ? readFileSync(devVarsPath, 'utf8').split(/\r?\n/) : [];
  let found = false;
  lines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) lines.push(`${key}=${value}`);
  writeFileSync(devVarsPath, lines.filter((l, i, a) => i < a.length - 1 || l !== '' || a.length === 1).join('\n') + '\n', 'utf8');
}

const vars = loadDevVars();
const clientId = process.env.GOOGLE_ADS_CLIENT_ID || vars.GOOGLE_ADS_CLIENT_ID;
const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || vars.GOOGLE_ADS_CLIENT_SECRET;
const pushWorker = process.argv.includes('--push-worker');

if (!clientId || !clientSecret) {
  console.error('Brak GOOGLE_ADS_CLIENT_ID lub GOOGLE_ADS_CLIENT_SECRET w .dev.vars');
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

console.log('Otwórz w przeglądarce (lub skopiuj URL):\n');
console.log(authUrl.toString());
console.log('');

const server = createServer(async (req, res) => {
  const u = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (u.pathname !== '/callback') {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const code = u.searchParams.get('code');
  const err = u.searchParams.get('error');
  if (err || !code) {
    res.writeHead(400);
    res.end(`OAuth error: ${err ?? 'no code'}`);
    server.close();
    process.exit(1);
    return;
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const data = await tokenRes.json();
  if (!tokenRes.ok || !data.refresh_token) {
    res.writeHead(500);
    res.end(`Token exchange failed: ${JSON.stringify(data)}`);
    server.close();
    process.exit(1);
    return;
  }

  upsertDevVar('GOOGLE_ADS_REFRESH_TOKEN', data.refresh_token);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>OK — refresh token zapisany w .dev.vars</h1><p>Możesz zamknąć kartę.</p>');
  console.log('Zapisano GOOGLE_ADS_REFRESH_TOKEN w', devVarsPath);

  if (pushWorker) {
    const child = spawn('npx', ['wrangler', 'secret', 'put', 'GOOGLE_ADS_REFRESH_TOKEN'], {
      cwd: join(repoRoot, 'workers', 'marketing-ingest'),
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: true,
    });
    child.stdin.write(`${data.refresh_token}\n`);
    child.stdin.end();
    await new Promise((resolve, reject) => {
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`wrangler exit ${code}`))));
    });
    console.log('Wrangler secret GOOGLE_ADS_REFRESH_TOKEN zaktualizowany.');
  }

  server.close();
  process.exit(0);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Callback: ${REDIRECT_URI}`);
  console.log('Czekam na autoryzację…');
});
