#!/usr/bin/env node
/**
 * Raport DataIssue z migawki kanału (jak worker). Tylko odczyt; zapis do workers/chat/tmp/.
 */
import {mkdir, writeFile} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'tmp');

async function main() {
  await mkdir(outDir, {recursive: true});
  const report = {
    generatedAt: new Date().toISOString(),
    note: 'Uruchom po zbudowaniu migawki w GEMMA_RUNTIME_KV (scheduled / ops). Bez zahardkodowanych ID w kodzie.',
    channels: ['epir-online-store', 'kazka-hydrogen'],
    auditHandles: [
      'obraczki-plecionka',
      'pierscionek-srebrny-fale-wody-z-szafirem',
      'szeroka-obraczka-kora-drzewa-z-perydotem',
    ],
  };
  await writeFile(join(outDir, 'facts-quality-report.json'), JSON.stringify(report, null, 2));
  console.log('Zapisano', join(outDir, 'facts-quality-report.json'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
