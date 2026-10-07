import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN = [
  'stone-origin.ts',
  'kazka-assortment',
  'grounded-turn',
  'buyer-reply-guard',
  'pierscionek-soliter',
  '4500724875369',
  'obraczki-plecionka',
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
      for (const needle of FORBIDDEN) {
        if (text.includes(needle)) hits.push(`${file}: ${needle}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
