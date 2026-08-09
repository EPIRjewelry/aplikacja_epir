#!/usr/bin/env node
/**
 * CLI do ops epir-marketing-ingest (bez ręcznego curl + Bearer).
 *
 * Wymaga w root .dev.vars:
 *   MARKETING_INGEST_ORIGIN=https://epir-marketing-ingest.<account>.workers.dev
 *   MARKETING_OPS_PREVIEW_KEY=<losowy token>
 *
 * Użycie:
 *   node scripts/marketing-ops.mjs audit [--campaign Epir_Forest-Dark]
 *   node scripts/marketing-ops.mjs expand [--campaign Epir_Forest-Dark] [--dry-run]
 *   node scripts/marketing-ops.mjs expand-metal --asset-group EPIR_Srebro --metal Srebro [--dry-run]
 *   node scripts/marketing-ops.mjs asset-group-status --asset-group Walentynki --status PAUSED [--dry-run]
 *   node scripts/marketing-ops.mjs forest-utm [--dry-run]
 *   node scripts/marketing-ops.mjs search-utm [--dry-run]
 *   node scripts/marketing-ops.mjs search-themes audit|apply --asset-group EPIR_Srebro [--dry-run]
 *   node scripts/marketing-ops.mjs search-terms [--days 14] [--campaign Epir_Forest-Dark]
 *   node scripts/marketing-ops.mjs search-negatives audit|apply [--dry-run]
 *   node scripts/marketing-ops.mjs customer-match analyze --csv <path>
 *   node scripts/marketing-ops.mjs customer-match sync [--segment all] [--dry-run]
 *   node scripts/marketing-ops.mjs audience-signals audit|apply --asset-group EPIR_Srebro [--dry-run]
 *   node scripts/marketing-ops.mjs preview [--date YYYY-MM-DD]
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  analyzeCsv,
  hashesForSegment,
  rowsForSegment,
  SEGMENTS,
} from './lib/customer-match-shopify.mjs';

const dir = dirname(fileURLToPath(import.meta.url));

function loadDevVars() {
  const paths = [join(dir, '../.dev.vars'), join(dir, './.dev.vars')];
  const out = {};
  for (const p of paths) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      out[k] = v;
    }
  }
  return out;
}

function usage() {
  console.error(`Użycie: node scripts/marketing-ops.mjs <komenda> [opcje]

Komendy:
  audit | expand | expand-metal | asset-group-status | asset-group-rename | asset-group-clone | forest-utm | search-utm | preview
  search-themes audit|apply
  search-terms
  search-negatives audit|apply
  customer-match analyze|upload|export|sync
  audience-signals audit|apply

Opcje:
  --csv <path>             eksport Shopify customers_export.csv
  --segment <klucz>        consent | high-value | repeat | all (domyślnie all)
  --out <katalog>          katalog exportu (domyślnie scripts/_tmp-ads-ops/customer-match)
  --campaign <nazwa>       kampania PMax (domyślnie Epir_Forest-Dark)
  --asset-group <nazwa>    EPIR_Srebro | EPIR_Zloto | Grupa plików 1 | Walentynki
  --status ENABLED|PAUSED  dla asset-group-status
  --source <nazwa>         źródło klonu (domyślnie --asset-group)
  --new-name <nazwa>      dla asset-group-rename / asset-group-clone
  --dry-run                tylko symulacja (mutacje)
  --days <N>               okres search-terms (domyślnie 14)
  --date YYYY-MM-DD        data preview GA4+Ads
`);
  process.exit(1);
}

const args = process.argv.slice(2);
const cmd = args[0];
if (!cmd) usage();

const vars = loadDevVars();
const origin = (process.env.MARKETING_INGEST_ORIGIN || vars.MARKETING_INGEST_ORIGIN || '').replace(
  /\/$/,
  '',
);
const key = process.env.MARKETING_OPS_PREVIEW_KEY || vars.MARKETING_OPS_PREVIEW_KEY || '';

if (!origin || !key) {
  console.error('Brak MARKETING_INGEST_ORIGIN lub MARKETING_OPS_PREVIEW_KEY.');
  console.error('Ustaw w root .dev.vars albo zmiennych środowiskowych.');
  process.exit(1);
}

function readFlag(name) {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return null;
  return args[i + 1];
}

const campaign = readFlag('--campaign') || 'Epir_Forest-Dark';
const assetGroup = readFlag('--asset-group');
const metal = readFlag('--metal');
const status = readFlag('--status');
const dryRun = args.includes('--dry-run');
const date = readFlag('--date');
const days = readFlag('--days') || '14';
const csvPath = readFlag('--csv');
const segment = readFlag('--segment') || 'all';
const outDir = readFlag('--out') || join(dir, '_tmp-ads-ops/customer-match');

function buildPath(route) {
  return `${origin}${route}`;
}

async function fetchOps(route) {
  const url = buildPath(route);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text.slice(0, 800)}`);
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

async function fetchOpsPost(route, body) {
  const url = buildPath(route);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text.slice(0, 800)}`);
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

let route = null;

if (cmd === 'customer-match') {
  const sub = args[1];
  if (sub === 'sync') {
    await fetchOpsPost('/ops/customer-match-sync', {
      dryRun,
      segment,
      attachSignals: true,
      campaign,
    });
    process.exit(0);
  }
  if (!csvPath) {
    console.error('customer-match analyze|upload|export wymaga --csv <ścieżka>');
    process.exit(1);
  }
  if (sub === 'analyze') {
    console.log(JSON.stringify(analyzeCsv(csvPath), null, 2));
    process.exit(0);
  }
  if (sub === 'export') {
    mkdirSync(outDir, { recursive: true });
    const keys = segment === 'all' ? Object.keys(SEGMENTS) : [segment];
    const manifest = { csvPath, outDir, files: [] };
    for (const key of keys) {
      if (!SEGMENTS[key]) {
        console.error(`Nieznany segment: ${key}`);
        process.exit(1);
      }
      const { listName, description, rows } = rowsForSegment(csvPath, key);
      const header = 'Email,First Name,Last Name,Country,Zip,Phone';
      const lines = [
        header,
        ...rows.map((r) =>
          [r.email, r.firstName, r.lastName, r.country, r.zip, r.phone]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(','),
        ),
      ];
      const fileName = `${listName}.csv`;
      const filePath = join(outDir, fileName);
      writeFileSync(filePath, lines.join('\n'), 'utf8');
      manifest.files.push({
        segment: key,
        listName,
        description,
        rowCount: rows.length,
        filePath,
      });
    }
    writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    console.log(JSON.stringify(manifest, null, 2));
    process.exit(0);
  }
  if (sub === 'upload') {
    const keys =
      segment === 'all' ? Object.keys(SEGMENTS) : [segment];
    for (const key of keys) {
      if (!SEGMENTS[key]) {
        console.error(`Nieznany segment: ${key}`);
        process.exit(1);
      }
      const { listName, description, hashes } = hashesForSegment(csvPath, key);
      console.error(`\n→ ${listName} (${hashes.length} hashy, dryRun=${dryRun})`);
      await fetchOpsPost('/ops/customer-match-upload', {
        listName,
        description,
        hashedEmails: hashes,
        dryRun,
      });
    }
    process.exit(0);
  }
  usage();
} else if (cmd === 'audience-signals') {
  const sub = args[1];
  if (!assetGroup) {
    console.error('audience-signals wymaga --asset-group EPIR_Srebro|EPIR_Zloto');
    process.exit(1);
  }
  const agQ = `assetGroup=${encodeURIComponent(assetGroup)}&campaign=${encodeURIComponent(campaign)}`;
  if (sub === 'audit') {
    route = `/ops/pmax-audience-signals-audit?${agQ}`;
  } else if (sub === 'apply') {
    route = `/ops/pmax-audience-signals-apply?dryRun=${dryRun ? '1' : '0'}&${agQ}`;
  } else usage();
} else if (cmd === 'search-themes') {
  const sub = args[1];
  if (!assetGroup) {
    console.error('search-themes wymaga --asset-group EPIR_Srebro|EPIR_Zloto|Grupa plików 1');
    process.exit(1);
  }
  const agQ = `assetGroup=${encodeURIComponent(assetGroup)}&campaign=${encodeURIComponent(campaign)}`;
  if (sub === 'audit') {
    route = `/ops/pmax-search-themes-audit?${agQ}`;
  } else if (sub === 'apply') {
    route = `/ops/pmax-search-themes-apply?dryRun=${dryRun ? '1' : '0'}&${agQ}`;
  } else usage();
} else if (cmd === 'search-terms') {
  route = `/ops/search-terms-audit?days=${encodeURIComponent(days)}&campaign=${encodeURIComponent(campaign)}`;
} else if (cmd === 'search-negatives') {
  const sub = args[1];
  if (sub === 'audit') {
    route = '/ops/search-negatives-audit';
  } else if (sub === 'apply') {
    route = `/ops/search-negatives-apply?dryRun=${dryRun ? '1' : '0'}`;
  } else usage();
} else if (cmd === 'expand-metal') {
  if (!assetGroup || !metal) {
    console.error('expand-metal wymaga --asset-group i --metal Srebro|Zloto');
    process.exit(1);
  }
  route = `/ops/pmax-listing-expand-metal?dryRun=${dryRun ? '1' : '0'}&campaign=${encodeURIComponent(campaign)}&assetGroup=${encodeURIComponent(assetGroup)}&metal=${encodeURIComponent(metal)}`;
} else if (cmd === 'asset-group-status') {
  if (!assetGroup || !status) {
    console.error('asset-group-status wymaga --asset-group i --status ENABLED|PAUSED');
    process.exit(1);
  }
  route = `/ops/pmax-asset-group-status?dryRun=${dryRun ? '1' : '0'}&campaign=${encodeURIComponent(campaign)}&assetGroup=${encodeURIComponent(assetGroup)}&status=${encodeURIComponent(status)}`;
} else if (cmd === 'asset-group-rename') {
  const newName = readFlag('--new-name');
  if (!assetGroup || !newName) {
    console.error('asset-group-rename wymaga --asset-group i --new-name');
    process.exit(1);
  }
  route = `/ops/pmax-asset-group-rename?dryRun=${dryRun ? '1' : '0'}&campaign=${encodeURIComponent(campaign)}&assetGroup=${encodeURIComponent(assetGroup)}&newName=${encodeURIComponent(newName)}`;
} else if (cmd === 'asset-group-clone') {
  const source = readFlag('--source') || assetGroup;
  const newName = readFlag('--new-name');
  if (!source || !newName) {
    console.error('asset-group-clone wymaga --source i --new-name');
    process.exit(1);
  }
  route = `/ops/pmax-asset-group-clone?dryRun=${dryRun ? '1' : '0'}&campaign=${encodeURIComponent(campaign)}&source=${encodeURIComponent(source)}&newName=${encodeURIComponent(newName)}`;
} else {
  const routes = {
    audit: `/ops/pmax-listing-audit?campaign=${encodeURIComponent(campaign)}`,
    expand: `/ops/pmax-listing-expand?dryRun=${dryRun ? '1' : '0'}&campaign=${encodeURIComponent(campaign)}`,
    'forest-utm': `/ops/pmax-forest-utm?dryRun=${dryRun ? '1' : '0'}&campaign=${encodeURIComponent(campaign)}`,
    'search-utm': `/ops/search-utm-suffixes?dryRun=${dryRun ? '1' : '0'}`,
    preview: `/ops/marketing-preview${date ? `?date=${encodeURIComponent(date)}` : ''}`,
  };
  route = routes[cmd] ?? null;
}

if (!route) usage();
await fetchOps(route);
