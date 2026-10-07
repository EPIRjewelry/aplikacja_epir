#!/usr/bin/env node
/**
 * Raport DataIssue — buduje migawkę tym samym kodem co worker (tsx → src/facts).
 * Lista audytowa żyje TYLKO tutaj (nie w src/).
 * Env: jak inventory (+ opcjonalnie PUBLIC_STOREFRONT_API_TOKEN_KAZKA dla GK).
 * Wynik: workers/chat/tmp/facts-quality-report.json
 */
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'tmp');

/** Audyt danych — przypadki testowe, nie wyjątki w kodzie produkcyjnym. */
const AUDIT_CASES = [
  {id: '4500724875369', note: 'tagi naturalne — pochodzenie nie z tagów'},
  {id: '15064341578060', note: 'Magiczny Ogród / tag rubin'},
  {handle: 'obraczki-plecionka', note: 'ametyst w tytule vs opis'},
  {handle: 'pierscionek-srebrny-fale-wody-z-szafirem', note: 'robocze nagłówki w opisie'},
  {handle: 'szeroka-obraczka-kora-drzewa-z-perydotem', note: 'audyt kamienia'},
];

async function loadDevVars() {
  const p = join(root, '.dev.vars');
  if (!existsSync(p)) return;
  const text = await readFile(p, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  await loadDevVars();
  await mkdir(outDir, {recursive: true});

  const env = {
    SHOP_DOMAIN: process.env.SHOP_DOMAIN,
    SHOPIFY_ADMIN_TOKEN: process.env.SHOPIFY_ADMIN_TOKEN,
    PUBLIC_STOREFRONT_API_TOKEN_KAZKA: process.env.PUBLIC_STOREFRONT_API_TOKEN_KAZKA,
    GEMMA_RUNTIME_KV: {
      _store: new Map(),
      async get(key, type) {
        const v = this._store.get(key);
        if (v == null) return null;
        return type === 'json' ? JSON.parse(v) : v;
      },
      async put(key, value) {
        this._store.set(key, value);
      },
    },
  };

  const refreshUrl = pathToFileURL(join(root, 'src/facts/refresh.ts')).href;
  const {refreshGeSnapshot, refreshGkSnapshot} = await import(refreshUrl);

  const ge = await refreshGeSnapshot(env);
  const gk = await refreshGkSnapshot(env);

  const geSnap = await env.GEMMA_RUNTIME_KV.get('catalog:v1:epir-online-store', 'json');
  const products = geSnap?.products || [];

  const allIssues = [];
  for (const p of products) {
    for (const issue of p.dataIssues || p.issues || []) {
      allIssues.push({productId: p.productId || p.product_id, handle: p.handle, issue});
    }
  }

  const audit = AUDIT_CASES.map((c) => {
    const hit = products.find(
      (p) =>
        (c.handle && p.handle === c.handle) ||
        (c.id && String(p.productId || p.product_id || '').includes(c.id)),
    );
    return {
      case: c,
      found: Boolean(hit),
      facts: hit
        ? {
            handle: hit.handle,
            productOriginRaw: hit.productOriginRaw,
            variants: (hit.variants || []).map((v) => ({
              id: v.variantId || v.variant_id,
              origin: v.stoneOrigin || v.origin,
              evidence: v.originEvidence || v.origin_evidence,
            })),
            dataIssues: hit.dataIssues || hit.issues,
          }
        : null,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    refresh: {ge, gk},
    productCount: products.length,
    issueCount: allIssues.length,
    issues: allIssues,
    audit,
    snapshotBytes: geSnap ? JSON.stringify(geSnap).length : 0,
    note: 'Rozmiar/czas migawki: do zmierzenia przy pełnym Bulk na produkcji.',
  };

  const outPath = join(outDir, 'facts-quality-report.json');
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log('Zapisano', outPath, `products=${products.length} issues=${allIssues.length}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
