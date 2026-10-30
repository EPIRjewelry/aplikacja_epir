#!/usr/bin/env node
/** Emit one JSON object per line for agent MCP create_file (title, parentId, textContent, mime fields). */
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const itemsDir = join(dir, '../tmp/drive-items');
const start = Number(process.argv[2] ?? 0);
const end = Number(process.argv[3] ?? 99);

for (const file of readdirSync(itemsDir).sort()) {
  const idx = Number(file.replace(/\D/g, ''));
  if (idx < start || idx > end) continue;
  const item = JSON.parse(readFileSync(join(itemsDir, file), 'utf8'));
  const out = {
    title: item.title,
    parentId: item.parentId,
    textContent: item.textContent,
  };
  if (item.contentMimeType) out.contentMimeType = item.contentMimeType;
  if (item.targetMimeType) out.targetMimeType = item.targetMimeType;
  process.stdout.write(JSON.stringify(out) + '\n');
}
