import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN = [
  'stone-origin.ts',
  'stone-intent.ts',
  'stone-retrieval.ts',
  'buyer-reply-guard',
  'buyer-reply-pipeline',
  'grounded-turn',
  'turn-seed',
  'page-product-card',
  'store-facts',
  'live-store-product',
  'kazka-assortment',
  'catalog-for-model',
  'kazka-hydrate',
  'AUDITED_SAPPHIRE_HANDLES',
  'KNOWN_NATURAL_HANDLES',
  'KNOWN_LAB_HANDLES',
  'soliter',
  'pierscionek-srebrny-fale-wody-z-szafirem',
  'szeroka-obraczka-kora-drzewa-z-perydotem',
  'zloty-pierscionek-z-naturalnym-szafirem',
  'obraczka-z-szafirem-epir-jewellery',
  'obraczki-plecionka',
  '4500724875369',
  '15064341578060',
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, {withFileTypes: true})) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p, acc);
    else if (name.name.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

describe('no hardcoded catalog legacy in src/', () => {
  it('does not reference forbidden catalog handles/modules', () => {
    const root = join(here, '..', 'src');
    const files = walk(root);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const lower = text.toLowerCase();
      for (const needle of FORBIDDEN) {
        if (lower.includes(needle.toLowerCase())) hits.push(`${file}: ${needle}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
