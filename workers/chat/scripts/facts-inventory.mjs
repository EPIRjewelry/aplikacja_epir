#!/usr/bin/env node
/**
 * Lokalna inwentaryzacja metapól i opcji wariantów (tylko odczyt).
 * Wymaga SHOPIFY_ADMIN_TOKEN i SHOP_DOMAIN w env lub workers/chat/.dev.vars (nie commituj).
 * Wynik: workers/chat/tmp/facts-inventory.json
 */
import {mkdir, writeFile} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'tmp');

async function main() {
  const token = process.env.SHOPIFY_ADMIN_TOKEN?.trim();
  const shop = process.env.SHOP_DOMAIN?.trim();
  if (!token || !shop) {
    console.error('Ustaw SHOPIFY_ADMIN_TOKEN i SHOP_DOMAIN (lub .dev.vars) i uruchom ponownie.');
    process.exit(1);
  }
  await mkdir(outDir, {recursive: true});
  const placeholder = {
    generatedAt: new Date().toISOString(),
    note: 'Pełne zapytania metafieldDefinitions — do rozszerzenia po pierwszym uruchomieniu przez właściciela.',
    shop,
  };
  await writeFile(join(outDir, 'facts-inventory.json'), JSON.stringify(placeholder, null, 2));
  console.log('Zapisano', join(outDir, 'facts-inventory.json'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
