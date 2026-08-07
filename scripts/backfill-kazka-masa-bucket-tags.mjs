#!/usr/bin/env node
/**
 * Backfill metafielda bucket masy kamienia (ct) dla produktów Kazka.
 *
 * Źródło masy: Body HTML / descriptionHtml — „Masa kamieni: X,XX ct” (przecinek PL OK).
 * Metafield (zgodne z apps/kazka collection-product-filters WEIGHT_URL_TO_METAFIELD):
 *   custom.masa_bucket (single_line_text): 0-0.2g | 0.2-0.5g | 0.5g+
 *
 * Tryby:
 *   --from-csv [path]   dry-run z eksportu Shopify (domyślnie D:\marketing\csv\produkty_kazka_shopify.csv)
 *   --dry-run           Admin API: tylko raport (domyślne przy braku --apply)
 *   --apply             Admin API: metafieldsSet (wymaga SHOPIFY_ADMIN_TOKEN)
 *
 * Operacja na sklepie Liquid (epir-art-silver-jewellery) — Admin API epir_ai.
 * Nie używa tokenów Hydrogen (apps/kazka).
 *
 * Po backfillu: włącz filtr Product metafield custom.masa_bucket w Search & Discovery
 * (checklist w apps/kazka/docs/COLLECTION_FILTERS_CURATOR.md).
 *
 * Legacy tagi masa-* pozostają na produktach — nie są usuwane.
 */

import {existsSync, readFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const DEFAULT_CSV = 'D:\\marketing\\csv\\produkty_kazka_shopify.csv';
const METAFIELD_NAMESPACE = 'custom';
const METAFIELD_KEY = 'masa_bucket';
const METAFIELD_TYPE = 'single_line_text_field';
const BUCKET_VALUES = ['0-0.2g', '0.2-0.5g', '0.5g+'];
const PAGE_SIZE = 50;
const THROTTLE_MS = 400;

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FROM_CSV = argv.includes('--from-csv');
const csvPathArg = (() => {
  const i = argv.indexOf('--from-csv');
  if (i < 0) return null;
  const next = argv[i + 1];
  if (next && !next.startsWith('--')) return next;
  return DEFAULT_CSV;
})();
const DRY_RUN = !APPLY;

function trimVal(line) {
  return line.trim().replace(/^['"]|['"]$/g, '');
}

function normalizeShopHost(raw) {
  let s = trimVal(raw);
  s = s.replace(/^https?:\/\//i, '').split('/')[0];
  return s;
}

function loadFromDevVars() {
  const dir = dirname(fileURLToPath(import.meta.url));
  const paths = [join(dir, '../.dev.vars'), join(dir, './.dev.vars')];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf8');
    const mToken =
      content.match(/SHOPIFY_ADMIN_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ADMIN_ACCESS_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ACCESS_TOKEN\s*=\s*(.+)/);
    const mShop = content.match(/SHOP\s*=\s*(.+)/);
    const mShopAlt = content.match(
      /(?:SHOP_DOMAIN|SHOPIFY_SHOP_DOMAIN)\s*=\s*(.+)/,
    );
    const token = mToken ? trimVal(mToken[1]) : null;
    const shop = mShop
      ? trimVal(mShop[1])
      : mShopAlt
        ? normalizeShopHost(mShopAlt[1])
        : null;
    if (token || shop) return {token, shop};
  }
  return {token: null, shop: null};
}

function resolveAdminToken() {
  return (
    process.env.SHOPIFY_ADMIN_TOKEN ||
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
    process.env.SHOPIFY_ACCESS_TOKEN ||
    null
  );
}

/** Parse „Masa kamieni: 0,25 ct” / „0.25 ct” from HTML or plain text. */
export function parseMasaKamieniCt(htmlOrText) {
  if (!htmlOrText) return null;
  const plain = String(htmlOrText)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  const m = plain.match(/Masa\s+kamieni\s*:\s*([\d]+(?:[.,]\d+)?)\s*ct/i);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** ct → custom.masa_bucket value. */
export function masaBucketMetafield(ct) {
  if (ct == null || !Number.isFinite(ct)) return null;
  if (ct < 0.2) return '0-0.2g';
  if (ct < 0.5) return '0.2-0.5g';
  return '0.5g+';
}

function emptyBucketCounts() {
  return {'0-0.2g': 0, '0.2-0.5g': 0, '0.5g+': 0};
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shopify product CSV: quoted fields may contain commas and newlines.
 * Returns array of row objects (header keys).
 */
function parseShopifyCsv(path) {
  const text = readFileSync(path, 'utf8');
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      cur = '';
      if (row.some((c) => c.length)) rows.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    if (row.some((c) => c.length)) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map((cols) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? '';
    });
    return obj;
  });
}

function findCsvMasaBucketColumn(headers) {
  if (!headers?.length) return null;
  const exact = headers.find(
    (h) =>
      h === 'Masa bucket (product.metafields.custom.masa_bucket)' ||
      h === 'masa_bucket (product.metafields.custom.masa_bucket)',
  );
  if (exact) return exact;
  return headers.find(
    (h) =>
      h.includes('metafields.custom.masa_bucket') ||
      h.toLowerCase().includes('masa_bucket'),
  );
}

async function runFromCsv(path) {
  if (!existsSync(path)) {
    console.error(`Brak pliku CSV: ${path}`);
    process.exit(1);
  }
  const counts = {
    products: 0,
    withMasa: 0,
    alreadyOk: 0,
    needAdd: 0,
    noMasa: 0,
    buckets: emptyBucketCounts(),
  };
  const samples = [];
  const seen = new Set();
  let masaBucketCol = null;

  for (const row of parseShopifyCsv(path)) {
    if (!masaBucketCol && row.Handle) {
      masaBucketCol = findCsvMasaBucketColumn(Object.keys(row));
    }
    const handle = (row.Handle || '').trim();
    const title = (row.Title || '').trim();
    if (!handle || !title) continue;
    if (seen.has(handle)) continue;
    seen.add(handle);
    const vendor = (row.Vendor || '').trim();
    if (vendor && vendor !== 'Kazka') continue;
    counts.products++;
    const body = row['Body (HTML)'] || '';
    const ct = parseMasaKamieniCt(body);
    if (ct == null) {
      counts.noMasa++;
      continue;
    }
    counts.withMasa++;
    const bucket = masaBucketMetafield(ct);
    counts.buckets[bucket]++;
    const existing =
      masaBucketCol ? String(row[masaBucketCol] || '').trim() : '';
    if (existing === bucket) {
      counts.alreadyOk++;
    } else {
      counts.needAdd++;
      if (samples.length < 12) {
        samples.push({
          handle,
          ct,
          bucket,
          existing: existing || null,
          title: title.slice(0, 60),
        });
      }
    }
  }

  console.log('=== Kazka masa_bucket metafield (CSV dry-run) ===');
  console.log(JSON.stringify({path, masaBucketCol, ...counts, samples}, null, 2));
  console.log(
    '\nChecklist S&D: Product metafield custom.masa_bucket + Variant option Próba złota / Jakość.',
  );
  console.log(
    'Apply (Admin): node scripts/backfill-kazka-masa-bucket-tags.mjs --apply',
  );
}

async function runAdmin() {
  if (!resolveAdminToken() || !process.env.SHOP) {
    const fromDev = loadFromDevVars();
    if (!resolveAdminToken() && fromDev.token) {
      process.env.SHOPIFY_ADMIN_TOKEN = fromDev.token;
    }
    if (!process.env.SHOP && fromDev.shop) process.env.SHOP = fromDev.shop;
  }
  if (!process.env.SHOP && process.env.SHOP_DOMAIN) {
    process.env.SHOP = normalizeShopHost(process.env.SHOP_DOMAIN);
  }
  if (!process.env.SHOP && process.env.SHOPIFY_SHOP_DOMAIN) {
    process.env.SHOP = normalizeShopHost(process.env.SHOPIFY_SHOP_DOMAIN);
  }
  if (!process.env.SHOP) process.env.SHOP = DEFAULT_SHOP;

  const TOKEN = resolveAdminToken();
  if (!TOKEN) {
    console.error(
      'Brak SHOPIFY_ADMIN_TOKEN. Użyj --from-csv do dry-run bez tokena,',
    );
    console.error('albo ustaw token w .dev.vars / env.');
    process.exit(1);
  }

  const SHOP = process.env.SHOP;
  const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

  async function gql(query, variables = {}) {
    await sleep(THROTTLE_MS);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
      },
      body: JSON.stringify({query, variables}),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status} ${res.statusText}: ${JSON.stringify(json)}`,
      );
    }
    if (json.errors?.length) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    return json.data;
  }

  const PRODUCTS_QUERY = `#graphql
    query KazkaProductsForMasa($cursor: String) {
      products(first: ${PAGE_SIZE}, after: $cursor, query: "tag:kazka status:active") {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          handle
          title
          descriptionHtml
          metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
            value
          }
        }
      }
    }
  `;

  const METAFIELDS_SET = `#graphql
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  let cursor = null;
  let hasNext = true;
  const stats = {
    scanned: 0,
    needAdd: 0,
    alreadyOk: 0,
    noMasa: 0,
    applied: 0,
    errors: 0,
    buckets: emptyBucketCounts(),
  };

  console.log(
    `=== Kazka masa_bucket metafield (${DRY_RUN ? 'dry-run' : 'APPLY'}) shop=${SHOP} ===`,
  );

  while (hasNext) {
    const data = await gql(PRODUCTS_QUERY, {cursor});
    const conn = data.products;
    for (const p of conn.nodes) {
      stats.scanned++;
      const ct = parseMasaKamieniCt(p.descriptionHtml);
      if (ct == null) {
        stats.noMasa++;
        continue;
      }
      const bucket = masaBucketMetafield(ct);
      stats.buckets[bucket]++;
      const existing = p.metafield?.value?.trim() ?? '';
      if (existing === bucket) {
        stats.alreadyOk++;
        continue;
      }
      stats.needAdd++;
      if (DRY_RUN) {
        console.log(
          `[dry-run] ${p.handle} ct=${ct} → ${METAFIELD_NAMESPACE}.${METAFIELD_KEY}=${bucket}` +
            (existing ? ` (was: ${existing})` : ''),
        );
        continue;
      }
      try {
        const result = await gql(METAFIELDS_SET, {
          metafields: [
            {
              ownerId: p.id,
              namespace: METAFIELD_NAMESPACE,
              key: METAFIELD_KEY,
              type: METAFIELD_TYPE,
              value: bucket,
            },
          ],
        });
        const errs = result.metafieldsSet?.userErrors || [];
        if (errs.length) throw new Error(JSON.stringify(errs));
        stats.applied++;
        console.log(`[ok] ${p.handle} → ${bucket}`);
      } catch (e) {
        stats.errors++;
        console.error(`[err] ${p.handle}: ${e.message}`);
      }
    }
    hasNext = conn.pageInfo.hasNextPage;
    cursor = conn.pageInfo.endCursor;
  }

  console.log(JSON.stringify(stats, null, 2));
  if (DRY_RUN) {
    console.log(
      '\nAby zapisać: node scripts/backfill-kazka-masa-bucket-tags.mjs --apply',
    );
  }
}

async function main() {
  if (FROM_CSV || csvPathArg) {
    await runFromCsv(csvPathArg || DEFAULT_CSV);
    return;
  }
  if (
    !resolveAdminToken() &&
    !loadFromDevVars().token &&
    existsSync(DEFAULT_CSV)
  ) {
    console.log('Brak Admin token — fallback --from-csv');
    await runFromCsv(DEFAULT_CSV);
    return;
  }
  await runAdmin();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
