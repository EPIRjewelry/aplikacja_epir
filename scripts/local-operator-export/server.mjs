/**
 * Lokalny most zapisu rozmów Operator Studio na dysk (D:\EPIR\operator-studio\…).
 * Uruchom: node scripts/local-operator-export/server.mjs
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'export.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const HOST = process.env.EXPORT_HTTP_HOST ?? config.host ?? '127.0.0.1';
const PORT = Number(process.env.EXPORT_HTTP_PORT ?? config.port ?? 9880);
const ROOT = path.resolve(process.env.OPERATOR_EXPORT_ROOT ?? config.rootDir ?? 'D:\\EPIR\\operator-studio');
const ROLE_DIRS = config.roleDirs ?? { analyst: 'analyst', cad: 'cad' };

function json(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(raw) });
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeFilename(name) {
  const base = path.basename(String(name ?? 'session.md'));
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'session.md';
}

function roleSubdir(role) {
  return ROLE_DIRS[role] ?? role ?? 'misc';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { ok: true, service: 'operator-export-bridge', root: ROOT });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/export/markdown') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const role = String(body.role ?? 'misc');
      const markdown = String(body.markdown ?? '');
      if (!markdown.trim()) {
        json(res, 400, { ok: false, error: { code: 'empty_markdown', message: 'markdown is required' } });
        return;
      }
      const sub = roleSubdir(role);
      const dir = path.join(ROOT, sub);
      fs.mkdirSync(dir, { recursive: true });
      const filename = safeFilename(body.filename ?? `${Date.now()}.md`);
      const fullPath = path.join(dir, filename);
      fs.writeFileSync(fullPath, markdown, 'utf8');
      json(res, 200, { ok: true, path: fullPath });
    } catch (e) {
      json(res, 500, {
        ok: false,
        error: { code: 'write_failed', message: e instanceof Error ? e.message : String(e) },
      });
    }
    return;
  }

  json(res, 404, { ok: false, error: { code: 'not_found', message: `Unknown path: ${url.pathname}` } });
});

server.listen(PORT, HOST, () => {
  console.log(`operator-export bridge listening on http://${HOST}:${PORT}`);
  console.log(`root: ${ROOT}`);
});
