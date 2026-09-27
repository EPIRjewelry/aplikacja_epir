#!/usr/bin/env node
/**
 * Thin wrapper → Python SSOT exporter (see export-kazka-meta-catalog.py).
 *
 *   npm run export:kazka-meta-catalog
 *   node scripts/export-kazka-meta-catalog.mjs --dry-run
 */
import {spawnSync} from 'child_process';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const py = join(dirname(fileURLToPath(import.meta.url)), 'export-kazka-meta-catalog.py');
const r = spawnSync('python', [py, ...process.argv.slice(2)], {stdio: 'inherit'});
process.exit(r.status ?? 1);
