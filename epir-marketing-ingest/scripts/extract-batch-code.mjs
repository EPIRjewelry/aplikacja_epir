import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const batchIndex = Number(process.argv[2] ?? '0');
const out = path.join(root, '.upload-chunks-b64', `_batch-${String(batchIndex).padStart(2,'0')}-code.txt`);
const { execSync } = await import('node:child_process');
const json = execSync(`node scripts/build-mcp-batch.mjs ${batchIndex}`, { cwd: root, encoding: 'utf8' });
const { code } = JSON.parse(json);
fs.writeFileSync(out, code);
console.log(out, code.length);
