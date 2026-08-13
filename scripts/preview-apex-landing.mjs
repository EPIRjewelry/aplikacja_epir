#!/usr/bin/env node
/**
 * Podgląd landingów Apex przy LANDINGS_ENABLED=false.
 * Używa MARKETING_OPS_PREVIEW_KEY lub EPIR_OPERATOR_PANEL_SECRET z root .dev.vars.
 *
 *   node scripts/preview-apex-landing.mjs organic_art
 *   node scripts/preview-apex-landing.mjs forest_premium
 *   node scripts/preview-apex-landing.mjs artisan_gold
 */
import {spawnSync} from 'child_process';
import {existsSync, readFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const campaign = process.argv[2]?.trim();
if (!campaign) {
  console.error('Użycie: node scripts/preview-apex-landing.mjs <utm_campaign>');
  console.error('Np. organic_art | forest_premium | artisan_rings | artisan_gold');
  process.exit(1);
}

function loadDevVars() {
  const paths = [join(dir, '../.dev.vars'), join(dir, '../workers/chat/.dev.vars')];
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

const vars = loadDevVars();
const token =
  vars.MARKETING_OPS_PREVIEW_KEY ||
  vars.EPIR_OPERATOR_PANEL_SECRET ||
  process.env.MARKETING_OPS_PREVIEW_KEY ||
  process.env.EPIR_OPERATOR_PANEL_SECRET;

if (!token) {
  console.error(
    'Brak MARKETING_OPS_PREVIEW_KEY lub EPIR_OPERATOR_PANEL_SECRET w .dev.vars.',
  );
  console.error(
    'Ustaw też ten sam sekret na workerze: cd workers/dynamic-landing-liquid && npx wrangler secret put EPIR_OPERATOR_PANEL_SECRET',
  );
  process.exit(1);
}

const url = new URL('https://l.epirbizuteria.pl/');
url.searchParams.set('utm_campaign', campaign);
url.searchParams.set('epir_preview', token);

console.log(url.toString());
console.log('');
console.log('Host musi być l.epirbizuteria.pl (nie epirbizuteria.pl).');
console.log('Otwórz powyższy URL w przeglądarce — pierwsze wejście ustawi sesję (cookie 24h).');
console.log('');

const verify = spawnSync('curl.exe', ['-sI', '-L', url.toString()], {encoding: 'utf8'});
const lines = (verify.stdout || '').split(/\r?\n/);
const statuses = lines.filter((l) => l.startsWith('HTTP/')).map((l) => l.trim());
const lastStatus = statuses[statuses.length - 1] || 'brak odpowiedzi';
const previewHeader = lines.some((l) => /X-EPIR-Landing-Preview:\s*true/i.test(l));
if (lastStatus.includes('200') && previewHeader) {
  console.log(`Weryfikacja OK: ${lastStatus} (podgląd aktywny)`);
} else {
  console.log(`Weryfikacja: ${lastStatus}`);
  if (!previewHeader) console.log('Brak X-EPIR-Landing-Preview — uruchom: node scripts/sync-landing-preview-secret.mjs');
  console.log('Jeśli przeglądarka nadal redirectuje: okno prywatne lub wyczyść cache dla l.epirbizuteria.pl');
}

console.log('');
console.log('Nagłówek alternatywny (bez tokenu w URL):');
console.log(
  `  curl.exe -H "X-Admin-Key: <EPIR_OPERATOR_PANEL_SECRET>" "${url.origin}/?utm_campaign=${campaign}"`,
);
console.log('');
console.log('Jednorazowa synchronizacja sekretu na worker landingu:');
console.log('  node scripts/sync-landing-preview-secret.mjs');
