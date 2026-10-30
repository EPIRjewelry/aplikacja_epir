#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const j = JSON.parse(readFileSync(join(dir, '../tmp-store-picture.json'), 'utf8'));
const out = join(dir, '../tmp/store-picture-drive-refresh');
mkdirSync(out, { recursive: true });

function tabularToCsv(rep) {
  const headers = [...(rep.dimensionHeaders || []), ...(rep.metricHeaders || [])];
  const lines = [headers.join(',')];
  for (const row of rep.rows || []) {
    lines.push(
      row
        .map((c) => {
          const s = String(c ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

const landing =
  (j.ga4 || []).find((r) => r.id === 'ga4-landing' || r.id === 'landing') || null;
if (!landing) throw new Error('ga4-landing missing in store-picture JSON');

const files = {
  'ga4-landing.csv': tabularToCsv(landing),
  'ads-search-terms.json': JSON.stringify(j.ads.searchTerms, null, 2),
  'ads-pmax-landings.json': JSON.stringify(j.ads.pmaxLandings, null, 2),
  'ads-conversion-snapshot.json': JSON.stringify(j.ads.conversionSnapshot, null, 2),
  'ads-search-landings.json': JSON.stringify(j.ads.searchLandings, null, 2),
};

for (const [name, body] of Object.entries(files)) {
  writeFileSync(join(out, name), body, 'utf8');
  console.log(name, body.length);
}
console.log(
  JSON.stringify({
    landingRows: landing.rowCount,
    stRows: j.ads.searchTerms?.rows?.length,
    pmUrls: j.ads.pmaxLandings?.byUrl?.length,
  }),
);
