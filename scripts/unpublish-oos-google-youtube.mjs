#!/usr/bin/env node
/**
 * Zdejmuje z kanału Google & YouTube produkty active z inventory_total:0.
 * Nie zmienia statusu (brak draft/archive). Nie rusza Online Store / headless.
 *
 *   node scripts/unpublish-oos-google-youtube.mjs --dry-run
 *   node scripts/unpublish-oos-google-youtube.mjs
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { GY_PUBLICATION_ID } from './lib/epir-metal-label.mjs';

const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const GY_NUMERIC = GY_PUBLICATION_ID.split('/').pop();
const PRODUCTS_QUERY_STRING = `status:active inventory_total:0 publication_ids:${GY_NUMERIC}`;
const PAGE_SIZE = 50;
const THROTTLE_MS = 400;
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
    if (token || shop) return { token, shop };
  }
  return { token: null, shop: null };
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
if (!process.env.SHOP) process.env.SHOP = DEFAULT_SHOP;

const SHOP = process.env.SHOP;
const TOKEN = resolveAdminToken();
if (!TOKEN) {
  console.error('Brak SHOPIFY_ADMIN_TOKEN');
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
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  if (json.errors?.length) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

const COUNT = `#graphql
  query C($q: String!) { productsCount(query: $q) { count } }
`;

const LIST = `#graphql
  query OosGy($cursor: String, $q: String!, $gyId: ID!) {
    products(first: ${PAGE_SIZE}, after: $cursor, query: $q) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        tags
        totalInventory
        templateSuffix
        publishedOnGy: publishedOnPublication(publicationId: $gyId)
      }
    }
  }
`;

const UNPUBLISH = `#graphql
  mutation Unpublish($id: ID!, $input: [PublicationInput!]!) {
    publishableUnpublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`;

async function main() {
  console.log(DRY_RUN ? 'DRY-RUN' : 'APPLY', { shop: SHOP, gy: GY_PUBLICATION_ID });
  const before = await gql(COUNT, { q: PRODUCTS_QUERY_STRING });
  console.log('oosOnGoogle before', before.productsCount.count);

  const rows = [];
  let cursor = null;
  for (;;) {
    const data = await gql(LIST, {
      cursor,
      q: PRODUCTS_QUERY_STRING,
      gyId: GY_PUBLICATION_ID,
    });
    const conn = data.products;
    for (const n of conn.nodes) {
      if (n.publishedOnGy !== true) continue;
      if ((n.totalInventory ?? 0) > 0) continue;
      rows.push(n);
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  console.log(`kandydaci=${rows.length}`);
  const log = [];
  let ok = 0;
  let errors = 0;
  for (const p of rows) {
    const line = {
      id: p.id,
      handle: p.handle,
      title: p.title,
      inventory: p.totalInventory,
      tags: p.tags,
      templateSuffix: p.templateSuffix,
    };
    console.log(`${DRY_RUN ? '[dry-run]' : 'UNPUBLISH GY'} ${p.handle} | inv=${p.totalInventory}`);
    if (DRY_RUN) {
      log.push({ ...line, status: 'dry-run' });
      continue;
    }
    try {
      const r = await gql(UNPUBLISH, {
        id: p.id,
        input: [{ publicationId: GY_PUBLICATION_ID }],
      });
      const err = r.publishableUnpublish.userErrors;
      if (err?.length) {
        errors += 1;
        log.push({ ...line, status: 'error', err });
        console.error(p.handle, err);
      } else {
        ok += 1;
        log.push({ ...line, status: 'unpublished' });
      }
    } catch (e) {
      errors += 1;
      log.push({ ...line, status: 'error', err: String(e) });
      console.error(p.handle, e);
    }
  }

  const after = await gql(COUNT, { q: PRODUCTS_QUERY_STRING });
  const summary = {
    dryRun: DRY_RUN,
    shop: SHOP,
    before: before.productsCount.count,
    candidates: rows.length,
    unpublished: ok,
    errors,
    after: after.productsCount.count,
    at: new Date().toISOString(),
  };
  console.log(JSON.stringify(summary, null, 2));
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '_tmp-ads-ops');
  writeFileSync(
    join(outDir, 'unpublish-oos-google-2026-08-15.json'),
    JSON.stringify({ summary, products: log }, null, 2),
  );
  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
