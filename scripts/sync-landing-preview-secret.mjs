#!/usr/bin/env node
/** Sync EPIR_OPERATOR_PANEL_SECRET to dynamic-landing worker (reuse, no new secret name). */
import {existsSync, readFileSync} from 'fs';
import {spawnSync} from 'child_process';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const devPath = join(dir, '../.dev.vars');
if (!existsSync(devPath)) {
  console.error('Brak .dev.vars');
  process.exit(1);
}
const content = readFileSync(devPath, 'utf8');
const m =
  content.match(/EPIR_OPERATOR_PANEL_SECRET\s*=\s*(.+)/) ||
  content.match(/MARKETING_OPS_PREVIEW_KEY\s*=\s*(.+)/);
if (!m) {
  console.error('Brak EPIR_OPERATOR_PANEL_SECRET / MARKETING_OPS_PREVIEW_KEY w .dev.vars');
  process.exit(1);
}
const token = m[1].trim().replace(/^['"]|['"]$/g, '');
if (!token) {
  console.error('Sekret w .dev.vars jest pusty');
  process.exit(1);
}
console.error(`Upload EPIR_OPERATOR_PANEL_SECRET (len=${token.length})…`);
const workerDir = join(dir, '../workers/dynamic-landing-liquid');
const r = spawnSync(
  'npx',
  ['wrangler', 'secret', 'put', 'EPIR_OPERATOR_PANEL_SECRET', '--env='],
  {
    cwd: workerDir,
    input: token,
    encoding: 'utf8',
    shell: true,
  },
);
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status ?? 1);
