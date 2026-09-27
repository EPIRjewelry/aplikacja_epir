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
 *   node scripts/marketing-ops.mjs landings-off [--campaign Epir_Forest-Dark] [--dry-run]
 *   node scripts/marketing-ops.mjs search-utm [--dry-run]
 *   node scripts/marketing-ops.mjs search-themes audit|apply --asset-group EPIR_Srebro [--dry-run]
 *   node scripts/marketing-ops.mjs search-terms [--days 14] [--campaign Epir_Forest-Dark]
 *   node scripts/marketing-ops.mjs search-negatives audit|apply [--dry-run]
 *   node scripts/marketing-ops.mjs search-negatives add-shared [--apply]
 *   node scripts/marketing-ops.mjs pmax-url-expansion [--apply]
 *   node scripts/marketing-ops.mjs pmax-landings [--days 14] [--campaign Epir_Forest-Dark]
 *   node scripts/marketing-ops.mjs search-landings [--days 14]
 *   node scripts/marketing-ops.mjs ads-account-audit
 *   node scripts/marketing-ops.mjs ads-exclude-home [--apply]
 *   node scripts/marketing-ops.mjs pmax-page-feed [--apply]
 *   node scripts/marketing-ops.mjs preview [--date YYYY-MM-DD]
 *   node scripts/marketing-ops.mjs gmc-mca [--mca-id 5858051677]
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
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
  audit | expand | expand-metal | shopping-count | asset-group-status | asset-group-rename | asset-group-clone | forest-utm | landings-off | search-utm | preview
  search-themes audit|apply
  search-terms
  search-negatives audit|apply|add-shared
  pmax-landings | search-landings | ads-account-audit | ads-exclude-home | pmax-page-feed | pmax-url-expansion | gmc-mca

Opcje:
  --campaign <nazwa>       kampania PMax (domyślnie Epir_Forest-Dark)
  --asset-group <nazwa>    EPIR_Srebro | EPIR_Zloto | Grupa plików 1 | Walentynki
  --status ENABLED|PAUSED  dla asset-group-status
  --source <nazwa>         źródło klonu (domyślnie --asset-group)
  --new-name <nazwa>      dla asset-group-rename / asset-group-clone
  --dry-run                tylko symulacja (mutacje)
  --days <N>               okres search-terms (domyślnie 14)
  --date YYYY-MM-DD        data preview GA4+Ads
  --mca-id <id>            MCA Merchant (domyślnie 5858051677)
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
const mcaId = readFlag('--mca-id') || '5858051677';

function buildPath(route) {
  return `${origin}${route}`;
}

async function fetchOps(route, { summary } = {}) {
  const url = buildPath(route);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text.slice(0, 800)}`);
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(text);
    console.log(JSON.stringify(data, null, 2));
  } catch {
    console.log(text);
    return;
  }
  if (summary === 'pmax-landings') printPmaxLandingsSummary(data);
  if (summary === 'search-landings') printSearchLandingsSummary(data);
}

function printPmaxLandingsSummary(data) {
  if (!data?.ok) return;
  console.error('\n--- PMax landing summary ---');
  console.error(`Campaign: ${data.campaign} | ${data.days}d | clicks: ${data.totals?.clicks ?? 0}`);
  if (data.truncated) console.error('(truncated at row limit — tail URLs may be missing)');
  const top = (data.byUrl ?? []).slice(0, 5);
  if (top.length) {
    console.error('Top URLs:');
    for (const row of top) {
      console.error(`  ${row.clickSharePct}% (${row.clicks}) ${row.url}`);
    }
  }
  const gold = (data.freezeTargets ?? []).find((t) => t.label === 'zlota-bizuteria');
  if (gold) {
    console.error(
      `Freeze zlota-bizuteria: ${gold.clickSharePct}% (${gold.clicks} clicks, matched=${gold.matched})`,
    );
  }
  const nets = data.byNetwork ?? [];
  if (nets.length) {
    console.error('Networks:');
    for (const n of nets) {
      console.error(`  ${n.network}: ${n.clickSharePct}% (${n.clicks})`);
    }
  }
}

function printSearchLandingsSummary(data) {
  if (!data?.ok) return;
  console.error('\n--- Search landing summary ---');
  console.error(`Campaign: ${data.campaign} | ${data.days}d | clicks: ${data.clickedTotals?.clicks ?? 0}`);
  const top = (data.clickedLastNDays ?? []).slice(0, 5);
  if (top.length) {
    console.error('Top clicked URLs:');
    for (const row of top) {
      console.error(`  ${row.clickSharePct ?? '?'}% (${row.clicks}) ${row.url}`);
    }
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

if (cmd === 'search-themes') {
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
} else if (cmd === 'pmax-url-expansion') {
  const apply = args.includes('--apply');
  route = `/ops/pmax-url-expansion?dryRun=${apply ? '0' : '1'}&campaign=${encodeURIComponent(campaign)}`;
} else if (cmd === 'pmax-landings') {
  route = `/ops/pmax-landing-audit?days=${encodeURIComponent(days)}&campaign=${encodeURIComponent(campaign)}`;
} else if (cmd === 'search-landings') {
  route = `/ops/search-landing-audit?days=${encodeURIComponent(days)}`;
} else if (cmd === 'ads-account-audit') {
  route = '/ops/ads-account-change-audit';
} else if (cmd === 'ads-exclude-home') {
  const apply = args.includes('--apply');
  route = `/ops/ads-exclude-home?dryRun=${apply ? '0' : '1'}`;
} else if (cmd === 'pmax-page-feed') {
  const apply = args.includes('--apply');
  route = `/ops/pmax-page-feed?dryRun=${apply ? '0' : '1'}&campaign=${encodeURIComponent(campaign)}`;
} else if (cmd === 'search-negatives') {
  const sub = args[1];
  if (sub === 'audit') {
    route = '/ops/search-negatives-audit';
  } else if (sub === 'apply') {
    route = `/ops/search-negatives-apply?dryRun=${dryRun ? '1' : '0'}`;
  } else if (sub === 'shared') {
    route = '/ops/shared-negatives-audit';
  } else if (sub === 'shared-apply') {
    route = `/ops/shared-negatives-apply?dryRun=${dryRun ? '1' : '0'}`;
  } else if (sub === 'add-shared') {
    const apply = args.includes('--apply');
    route = `/ops/shared-negatives-keywords-apply?dryRun=${apply ? '0' : '1'}&list=${encodeURIComponent('Safety Filter - Marki')}`;
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
    'shopping-count': `/ops/pmax-shopping-product-count?campaign=${encodeURIComponent(campaign)}`,
    expand: `/ops/pmax-listing-expand?dryRun=${dryRun ? '1' : '0'}&campaign=${encodeURIComponent(campaign)}`,
    'forest-utm': `/ops/pmax-forest-utm?dryRun=${dryRun ? '1' : '0'}&campaign=${encodeURIComponent(campaign)}`,
    'landings-off': `/ops/pmax-landings-disable?dryRun=${dryRun ? '1' : '0'}&campaign=${encodeURIComponent(campaign)}`,
    'search-utm': `/ops/search-utm-suffixes?dryRun=${dryRun ? '1' : '0'}`,
    preview: `/ops/marketing-preview${date ? `?date=${encodeURIComponent(date)}` : ''}`,
    'gmc-mca': `/ops/gmc-mca-overview?mcaId=${encodeURIComponent(mcaId)}`,
  };
  route = routes[cmd] ?? null;
}

if (!route) usage();

const summary =
  cmd === 'pmax-landings' ? 'pmax-landings' : cmd === 'search-landings' ? 'search-landings' : null;
await fetchOps(route, { summary });
