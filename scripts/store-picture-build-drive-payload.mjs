#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const bundleDir = join(dir, '../tmp/store-picture-csv');
const parentId = process.argv[2];
if (!parentId) {
  console.error('usage: node store-picture-build-drive-payload.mjs <folderId>');
  process.exit(1);
}

const items = [];
for (const name of readdirSync(bundleDir).sort()) {
  const textContent = readFileSync(join(bundleDir, name), 'utf8');
  const base = {
    title: name.replace(/\.(csv|json|md)$/, ''),
    parentId,
    textContent,
  };
  if (name.endsWith('.csv')) {
    items.push({
      ...base,
      title: name.replace(/\.csv$/, ''),
      contentMimeType: 'text/csv',
      targetMimeType: 'application/vnd.google-apps.spreadsheet',
    });
  } else if (name.endsWith('.md')) {
    items.push({
      ...base,
      title: 'INDEX',
      contentMimeType: 'text/markdown',
      targetMimeType: 'application/vnd.google-apps.document',
    });
  } else {
    items.push({
      ...base,
      title: name,
      contentMimeType: 'application/json',
    });
  }
}

const out = join(dir, '../tmp/drive-upload-payload.json');
writeFileSync(out, JSON.stringify(items), 'utf8');
console.log(out, items.length);
