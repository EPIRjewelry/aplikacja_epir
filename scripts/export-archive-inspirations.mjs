#!/usr/bin/env node
/**
 * Eksport Archiwum Inspiracji — produkty z tagiem `sprzedane` (Admin API).
 * Celowo pomija ceny i warianty commerce. Obrazy pozostają na CDN Shopify.
 *
 * Wymaga: SHOPIFY_ADMIN_TOKEN (scope: read_products)
 *   Alias: SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_ACCESS_TOKEN
 *
 * Uruchom:
 *   node scripts/export-archive-inspirations.mjs --dry-run
 *   node scripts/export-archive-inspirations.mjs
 *   node scripts/export-archive-inspirations.mjs --out=apps/inspiracje/app/data/archive-inspirations.json
 *
 * Opcjonalnie: ARCHIVE_PRODUCT_QUERY (domyślnie tag:sprzedane)
 *              ARCHIVE_COLLECTION_HANDLE — zamiast query pobierz produkty z kolekcji
 */

import {mkdirSync, writeFileSync, readFileSync, existsSync} from 'fs';
import {dirname, join, resolve} from 'path';
import {fileURLToPath} from 'url';

/** Zgodnie z `shopify.app.toml` → `[webhooks] api_version = "2026-04"` */
const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const DEFAULT_TAG_QUERY = 'tag:sprzedane';
const PAGE_SIZE = 50;
const THROTTLE_MS = 350;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(
  ROOT,
  'apps/inspiracje/app/data/archive-inspirations.json',
);

const DRY_RUN = process.argv.includes('--dry-run');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const OUT_PATH = resolve(outArg ? outArg.slice('--out='.length) : DEFAULT_OUT);

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
  const paths = [
    join(dir, '../.dev.vars'),
    join(dir, './.dev.vars'),
    join(dir, '../apps/inspiracje/.dev.vars'),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf8');
    const mToken =
      content.match(/SHOPIFY_ADMIN_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ADMIN_ACCESS_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ACCESS_TOKEN\s*=\s*(.+)/);
    const mShop = content.match(/SHOP\s*=\s*(.+)/);
    const mShopAlt = content.match(
      /(?:SHOP_DOMAIN|SHOPIFY_SHOP_DOMAIN|PUBLIC_STORE_DOMAIN)\s*=\s*(.+)/,
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
if (!process.env.SHOP && process.env.PUBLIC_STORE_DOMAIN) {
  process.env.SHOP = normalizeShopHost(process.env.PUBLIC_STORE_DOMAIN);
}
if (!process.env.SHOP) {
  process.env.SHOP = DEFAULT_SHOP;
}

const SHOP = process.env.SHOP;
const TOKEN = resolveAdminToken();
const COLLECTION_HANDLE = (
  process.env.ARCHIVE_COLLECTION_HANDLE || ''
).trim();
const PRODUCT_QUERY = (
  process.env.ARCHIVE_PRODUCT_QUERY || DEFAULT_TAG_QUERY
).trim();

if (!TOKEN) {
  console.error(
    'Brak SHOPIFY_ADMIN_TOKEN (token Admin API sklepu Liquid / epir_ai).',
  );
  console.error(
    'Ustaw env lub root/.dev.vars — scope: read_products. Nie używaj tokenów Hydrogen.',
  );
  process.exit(1);
}

const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

const PRODUCT_FIELDS = `
  id
  handle
  title
  status
  productType
  vendor
  tags
  descriptionHtml
  publishedAt
  updatedAt
  featuredImage {
    url
    altText
    width
    height
  }
  images(first: 12) {
    nodes {
      url
      altText
      width
      height
    }
  }
  metafields(first: 20, namespace: "custom") {
    nodes {
      key
      value
      type
    }
  }
`;

const PRODUCTS_BY_QUERY = `#graphql
  query ArchiveInspirationsProducts($cursor: String, $query: String!) {
    products(first: ${PAGE_SIZE}, after: $cursor, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ${PRODUCT_FIELDS}
      }
    }
  }
`;

const COLLECTION_BY_HANDLE = `#graphql
  query ArchiveInspirationsCollection($handle: String!) {
    collectionByHandle(handle: $handle) {
      id
      handle
      title
    }
  }
`;

const COLLECTION_PRODUCTS = `#graphql
  query ArchiveInspirationsCollectionProducts($id: ID!, $cursor: String) {
    collection(id: $id) {
      products(first: ${PAGE_SIZE}, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${PRODUCT_FIELDS}
        }
      }
    }
  }
`;

function pickMetafields(nodes) {
  const wanted = new Set([
    'stone',
    'kamien',
    'metal',
    'material',
    'year',
    'rok',
    'accent_color',
  ]);
  const out = {};
  for (const n of nodes || []) {
    if (!n?.key) continue;
    const key = String(n.key).toLowerCase();
    if (wanted.has(key) || key.includes('stone') || key.includes('metal')) {
      out[n.key] = n.value;
    }
  }
  return out;
}

function mapProduct(node) {
  const images = (node.images?.nodes || []).map((img) => ({
    url: img.url,
    altText: img.altText || node.title,
    width: img.width ?? null,
    height: img.height ?? null,
  }));
  const featured = node.featuredImage
    ? {
        url: node.featuredImage.url,
        altText: node.featuredImage.altText || node.title,
        width: node.featuredImage.width ?? null,
        height: node.featuredImage.height ?? null,
      }
    : images[0] || null;

  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    status: node.status,
    productType: node.productType || '',
    vendor: node.vendor || '',
    tags: node.tags || [],
    descriptionHtml: node.descriptionHtml || '',
    publishedAt: node.publishedAt || null,
    updatedAt: node.updatedAt || null,
    featuredImage: featured,
    images,
    metafields: pickMetafields(node.metafields?.nodes),
  };
}

async function fetchByProductQuery(query) {
  const items = [];
  let cursor = null;
  let page = 0;
  for (;;) {
    page += 1;
    const data = await gql(PRODUCTS_BY_QUERY, {cursor, query});
    const conn = data.products;
    const batch = (conn.nodes || []).map(mapProduct);
    items.push(...batch);
    console.error(
      `[export] page ${page}: +${batch.length} (łącznie ${items.length})`,
    );
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return items;
}

async function fetchByCollectionHandle(handle) {
  const colData = await gql(COLLECTION_BY_HANDLE, {handle});
  const collection = colData.collectionByHandle;
  if (!collection?.id) {
    throw new Error(`Nie znaleziono kolekcji o handle="${handle}"`);
  }
  console.error(
    `[export] kolekcja ${collection.handle} (${collection.title}) id=${collection.id}`,
  );
  const items = [];
  let cursor = null;
  let page = 0;
  for (;;) {
    page += 1;
    const data = await gql(COLLECTION_PRODUCTS, {
      id: collection.id,
      cursor,
    });
    const conn = data.collection?.products;
    if (!conn) break;
    const batch = (conn.nodes || []).map(mapProduct);
    items.push(...batch);
    console.error(
      `[export] page ${page}: +${batch.length} (łącznie ${items.length})`,
    );
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return {items, collection};
}

function assertNoPrices(payload) {
  const raw = JSON.stringify(payload);
  const forbidden = [
    '"price"',
    '"amount"',
    '"currencyCode"',
    '"variants"',
    '"compareAtPrice"',
  ];
  for (const needle of forbidden) {
    if (raw.includes(needle)) {
      throw new Error(
        `Eksport zawiera zabronione pole commerce (${needle}). Abort.`,
      );
    }
  }
}

function summarize(items) {
  const withImage = items.filter((p) => p.featuredImage?.url).length;
  const withDesc = items.filter(
    (p) => (p.descriptionHtml || '').replace(/<[^>]+>/g, '').trim().length > 0,
  ).length;
  const missingImage = items.filter((p) => !p.featuredImage?.url).map((p) => p.handle);
  const missingDesc = items
    .filter(
      (p) =>
        !(p.descriptionHtml || '').replace(/<[^>]+>/g, '').trim().length,
    )
    .map((p) => p.handle);
  return {withImage, withDesc, missingImage, missingDesc};
}

async function main() {
  console.error(`[export] shop=${SHOP} dryRun=${DRY_RUN}`);
  console.error(`[export] out=${OUT_PATH}`);

  let items;
  let source;
  if (COLLECTION_HANDLE) {
    console.error(`[export] źródło: kolekcja handle=${COLLECTION_HANDLE}`);
    const result = await fetchByCollectionHandle(COLLECTION_HANDLE);
    items = result.items;
    source = {
      type: 'collection',
      handle: result.collection.handle,
      title: result.collection.title,
    };
  } else {
    console.error(`[export] źródło: product query="${PRODUCT_QUERY}"`);
    items = await fetchByProductQuery(PRODUCT_QUERY);
    source = {type: 'productQuery', query: PRODUCT_QUERY};
  }

  // Stabilna kolejność — najpierw świeższe updatedAt
  items.sort((a, b) => {
    const ta = a.updatedAt || a.publishedAt || '';
    const tb = b.updatedAt || b.publishedAt || '';
    return tb.localeCompare(ta);
  });

  const stats = summarize(items);
  const payload = {
    exportedAt: new Date().toISOString(),
    shop: SHOP,
    source,
    count: items.length,
    ctaUrl: 'https://epirbizuteria.pl/pages/zaprojektuj-swoj-model',
    ctaLabel: 'Zaprojektuj swój model',
    items,
  };

  assertNoPrices(payload);

  console.error(`[export] count=${items.length}`);
  console.error(
    `[export] ze zdjęciem=${stats.withImage}, z opisem=${stats.withDesc}`,
  );
  if (stats.missingImage.length) {
    console.error(
      `[export] brak zdjęcia (${stats.missingImage.length}): ${stats.missingImage.slice(0, 20).join(', ')}${stats.missingImage.length > 20 ? '…' : ''}`,
    );
  }
  if (stats.missingDesc.length) {
    console.error(
      `[export] brak opisu (${stats.missingDesc.length}): ${stats.missingDesc.slice(0, 20).join(', ')}${stats.missingDesc.length > 20 ? '…' : ''}`,
    );
  }

  if (DRY_RUN) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          count: items.length,
          source,
          sampleHandles: items.slice(0, 8).map((i) => i.handle),
          stats,
        },
        null,
        2,
      ),
    );
    return;
  }

  mkdirSync(dirname(OUT_PATH), {recursive: true});
  writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.error(`[export] zapisano ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[export] FAIL', err);
  process.exit(1);
});
