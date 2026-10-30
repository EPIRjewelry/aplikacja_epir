#!/usr/bin/env node
/**
 * Prints upload manifest (title, parentId, paths) for agent/MCP Drive upload.
 * Does not call Drive API — no OAuth in repo.
 */
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const bundleDir = join(dir, '../tmp/store-picture-csv');
const parentId = process.argv[2] ?? '';
const files = readdirSync(bundleDir).sort();
const out = files.map((name) => ({
  name,
  path: join(bundleDir, name),
  size: readFileSync(join(bundleDir, name)).length,
  asSheet: name.endsWith('.csv'),
}));
console.log(JSON.stringify({ parentId, files: out }, null, 2));
