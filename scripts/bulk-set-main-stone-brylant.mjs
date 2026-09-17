#!/usr/bin/env node
/**
 * Bulk: custom.main_stone = "Brylant" dla produktów w kolekcji.
 *
 * Operacja na sklepie Liquid (epir-art-silver-jewellery) — Admin API epir_ai.
 * Mutacja: productUpdate (tylko metafield custom.main_stone).
 *
 * Wymaga: SHOPIFY_ADMIN_TOKEN (read_products, write_products)
 *   Alias: SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_ACCESS_TOKEN
 *   Domena: SHOPIFY_STORE_DOMAIN, SHOP, SHOPIFY_SHOP_DOMAIN
 *
 * Uruchom:
 *   node scripts/bulk-set-main-stone-brylant.mjs --dry-run
 *   node scripts/bulk-set-main-stone-brylant.mjs
 */

import {readFileSync, existsSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

/** Zgodnie z `shopify.app.toml` → `[webhooks] api_version = "2026-04"` */
const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const COLLECTION_ID = 'gid://shopify/Collection/674812330316';
const PAGE_SIZE = 50;
const THROTTLE_MS = 500;
const MAIN_STONE_VALUE = 'Brylant';
const META_NAMESPACE = 'custom';
const META_KEY = 'main_stone';

const DRY_RUN = process.argv.includes('--dry-run');

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
    const mShopAlt = content.match(/(?:SHOP_DOMAIN|SHOPIFY_SHOP_DOMAIN)\s*=\s*(.+)/);
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
if (!process.env.SHOP && process.env.SHOPIFY_STORE_DOMAIN) {
  process.env.SHOP = normalizeShopHost(process.env.SHOPIFY_STORE_DOMAIN);
}
if (!process.env.SHOP) process.env.SHOP = DEFAULT_SHOP;

const SHOP = process.env.SHOP;
const TOKEN = resolveAdminToken();

if (!TOKEN) {
  console.error('Brak SHOPIFY_ADMIN_TOKEN (Admin API sklepu Liquid / epir_ai).');
  process.exit(1);
}

const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(header) {
  if (!header) return 0;
  const sec = Number(header);
  if (Number.isFinite(sec)) return Math.max(0, sec * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

async function gql(query, variables = {}, {throttle = true} = {}) {
  if (throttle) await sleep(THROTTLE_MS);

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
      },
      body: JSON.stringify({query, variables}),
    });

    if (res.status === 429) {
      const wait = Math.max(
        parseRetryAfterMs(res.headers.get('retry-after')),
        THROTTLE_MS,
      );
      console.warn(`429 — czekam ${wait}ms (attempt ${attempt}/5)`);
      await sleep(wait);
      continue;
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
    }
    if (json.errors?.length) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    return json.data;
  }

  throw new Error('Przekroczono limit retry po 429');
}

const COLLECTION_PRODUCTS = `#graphql
  query CollectionProducts($id: ID!, $cursor: String) {
    collection(id: $id) {
      title
      products(first: ${PAGE_SIZE}, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          metafield(namespace: "${META_NAMESPACE}", key: "${META_KEY}") {
            value
          }
        }
      }
    }
  }
`;

const PRODUCT_UPDATE = `#graphql
  mutation SetMainStone($input: ProductUpdateInput!) {
    productUpdate(product: $input) {
      product {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function* iterateCollectionProducts() {
  let cursor = null;
  let page = 0;

  for (;;) {
    page += 1;
    const data = await gql(COLLECTION_PRODUCTS, {id: COLLECTION_ID, cursor});
    const collection = data?.collection;
    if (!collection) throw new Error(`Brak kolekcji ${COLLECTION_ID}`);

    const conn = collection.products;
    const nodes = conn?.nodes ?? [];
    console.log(
      `Strona ${page}: ${nodes.length} produktów (kolekcja: ${collection.title})`,
    );

    for (const product of nodes) yield product;

    if (!conn?.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
}

async function setMainStone(product) {
  if (DRY_RUN) {
    console.log(
      `[dry-run] ${product.title} | ${product.id} → ${MAIN_STONE_VALUE}`,
    );
    return {ok: true};
  }

  const data = await gql(PRODUCT_UPDATE, {
    input: {
      id: product.id,
      metafields: [
        {
          namespace: META_NAMESPACE,
          key: META_KEY,
          type: 'single_line_text_field',
          value: MAIN_STONE_VALUE,
        },
      ],
    },
  });

  const userErrors = data?.productUpdate?.userErrors ?? [];
  if (userErrors.length) {
    throw new Error(userErrors.map((e) => e.message).join('; '));
  }

  console.log(`OK: ${product.title} | ${product.id}`);
  return {ok: true};
}

async function main() {
  console.log(`Shop: ${SHOP}`);
  console.log(`Collection: ${COLLECTION_ID}`);
  console.log(`Metafield: ${META_NAMESPACE}.${META_KEY} = "${MAIN_STONE_VALUE}"`);
  console.log(`Tryb: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);
  console.log('');

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for await (const product of iterateCollectionProducts()) {
    const current = product.metafield?.value?.trim();
    if (current === MAIN_STONE_VALUE) {
      skipped += 1;
      continue;
    }

    try {
      await setMainStone(product);
      updated += 1;
    } catch (e) {
      failed += 1;
      console.error(
        `FAIL: ${product.title} | ${product.id} — ${e.message || e}`,
      );
    }
  }

  console.log('');
  console.log(
    `Podsumowanie: updated=${updated}, failed=${failed}, skipped=${skipped}`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
