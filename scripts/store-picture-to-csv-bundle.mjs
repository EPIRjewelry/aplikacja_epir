#!/usr/bin/env node
/**
 * Reads tmp-store-picture.json → writes CSV files under tmp/store-picture-csv/
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const inPath = process.argv[2] ?? join(dir, '../tmp-store-picture.json');
const outDir = process.argv[3] ?? join(dir, '../tmp/store-picture-csv');

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function tabularToCsv(report) {
  if (report.error) {
    return `error\n${csvEscape(report.error)}\n`;
  }
  const headers = [...(report.dimensionHeaders ?? []), ...(report.metricHeaders ?? [])];
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of report.rows ?? []) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n') + '\n';
}

const raw = readFileSync(inPath, 'utf8');
const data = JSON.parse(raw);
if (!data.ok) {
  console.error('JSON not ok', data);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const manifest = [];

for (const report of data.ga4 ?? []) {
  const name = `${report.id}.csv`;
  writeFileSync(join(outDir, name), tabularToCsv(report), 'utf8');
  manifest.push({ name, rowCount: report.rowCount, error: report.error });
}

for (const key of ['campaignDaily', 'campaignSummary']) {
  const report = data.ads?.[key];
  if (!report) continue;
  const name = `ads-${key}.csv`;
  writeFileSync(join(outDir, name), tabularToCsv(report), 'utf8');
  manifest.push({ name, rowCount: report.rowCount, error: report.error });
}

const jsonExports = [
  ['ads-search-terms.json', data.ads?.searchTerms],
  ['ads-pmax-landings.json', data.ads?.pmaxLandings],
  ['ads-search-landings.json', data.ads?.searchLandings],
  ['ads-conversion-snapshot.json', data.ads?.conversionSnapshot],
];
for (const [name, obj] of jsonExports) {
  writeFileSync(join(outDir, name), JSON.stringify(obj, null, 2), 'utf8');
  manifest.push({ name, type: 'json' });
}

const indexMd = `# EPIR obraz sklepu ${data.window.startDate} — ${data.window.endDate}

${data.disclaimer}

Pobrano: ${data.fetchedAt}

## Pliki CSV (GA4 + Ads kampanie)

${manifest
  .filter((m) => m.name.endsWith('.csv'))
  .map((m) => `- ${m.name}${m.error ? ` (błąd: ${m.error})` : ` (${m.rowCount ?? '?'} wierszy)`}`)
  .join('\n')}

## JSON (audyty Ads)

${manifest.filter((m) => m.name.endsWith('.json')).map((m) => `- ${m.name}`).join('\n')}
`;

writeFileSync(join(outDir, 'INDEX.md'), indexMd, 'utf8');
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ window: data.window, manifest }, null, 2), 'utf8');
console.log(JSON.stringify({ outDir, files: manifest.length + 2 }, null, 2));
