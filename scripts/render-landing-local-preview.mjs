#!/usr/bin/env node
/**
 * Podgląd nowej palety landingów PRZED deployem (statyczny HTML lokalnie).
 *
 *   node scripts/render-landing-local-preview.mjs
 *   node scripts/render-landing-local-preview.mjs organic_art forest_premium
 */
import {spawnSync} from 'child_process';
import {existsSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const workerDir = join(dir, '../workers/dynamic-landing-liquid');
const args = process.argv.slice(2);

const r = spawnSync(
  'npx',
  ['tsx', 'scripts/export-landing-preview.ts', ...args],
  {cwd: workerDir, encoding: 'utf8', shell: true},
);
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.status !== 0) process.exit(r.status ?? 1);

const outDir = join(workerDir, '.preview-html');
const first = args[0] || 'organic_art';
const htmlPath = join(outDir, `${first}.html`);
if (existsSync(htmlPath)) {
  spawnSync('cmd', ['/c', 'start', '', htmlPath], {shell: true});
}
