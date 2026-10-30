#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const items = JSON.parse(readFileSync(join(dir, '../tmp/drive-upload-payload.json'), 'utf8'));
const outDir = join(dir, '../tmp/drive-items');
mkdirSync(outDir, { recursive: true });
items.forEach((item, i) => {
  writeFileSync(join(outDir, `${String(i).padStart(2, '0')}.json`), JSON.stringify(item), 'utf8');
});
console.log(outDir, items.length);
