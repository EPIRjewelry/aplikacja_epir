#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const raw = process.argv[2];
if (!raw) {
  console.error('usage: node store-picture-emit-drive-payload.mjs <00-15>');
  process.exit(1);
}
const idx = String(raw).padStart(2, '0');
const item = JSON.parse(readFileSync(join(dir, `../tmp/drive-items/${idx}.json`), 'utf8'));
const out = {
  title: item.title,
  parentId: item.parentId,
  textContent: item.textContent,
};
if (item.contentMimeType) out.contentMimeType = item.contentMimeType;
if (item.targetMimeType) out.targetMimeType = item.targetMimeType;
const path = join(dir, `_drive_upload_${idx}.json`);
writeFileSync(path, JSON.stringify(out), 'utf8');
console.log(path, out.title, out.textContent.length);
