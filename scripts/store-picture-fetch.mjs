#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));

function loadDevVars() {
  const out = {};
  for (const p of [join(dir, '../.dev.vars'), join(dir, './.dev.vars')]) {
    try {
      for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const i = t.indexOf('=');
        if (i < 0) continue;
        let v = t.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        out[t.slice(0, i).trim()] = v;
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

const vars = loadDevVars();
const origin = (process.env.MARKETING_INGEST_ORIGIN || vars.MARKETING_INGEST_ORIGIN || '').replace(
  /\/$/,
  '',
);
const key = process.env.MARKETING_OPS_PREVIEW_KEY || vars.MARKETING_OPS_PREVIEW_KEY || '';
const start = process.argv[2] ?? '2026-09-20';
const end = process.argv[3] ?? '2026-10-26';
const outPath = process.argv[4] ?? join(dir, '../tmp-store-picture.json');

if (!origin || !key) {
  console.error('Brak MARKETING_INGEST_ORIGIN lub MARKETING_OPS_PREVIEW_KEY');
  process.exit(1);
}

const url = `${origin}/ops/store-picture?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
const text = await res.text();
writeFileSync(outPath, text, 'utf8');
console.log(JSON.stringify({ status: res.status, bytes: text.length, outPath }));
