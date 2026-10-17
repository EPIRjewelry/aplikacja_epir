import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN = [
  'soliter',
  'pierscionek-srebrny-fale-wody-z-szafirem',
  'AUDITED_SAPPHIRE_HANDLES',
  '4500724875369',
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, {withFileTypes: true})) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p, acc);
    else if (name.name.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

describe('E2b no hardcoded products in gemma/facts', () => {
  it('T-E2b-NEG-1: gemma/facts src has no forbidden catalog needles', () => {
    const root = join(here, '..', '..', '..', 'src', 'gemma', 'facts');
    const files = walk(root);
    const hits: string[] = [];
    for (const file of files) {
      const lower = readFileSync(file, 'utf8').toLowerCase();
      for (const needle of FORBIDDEN) {
        if (lower.includes(needle.toLowerCase())) hits.push(`${file}: ${needle}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
