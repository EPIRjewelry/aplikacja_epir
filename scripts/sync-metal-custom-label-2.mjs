#!/usr/bin/env node
/**
 * Ustawia mm-google-shopping.custom_label_2 = Srebro | Zloto na wariantach
 * produktów spełniających kontrakt EPIR (nowy-szablon lub pierscionek-zloto-turmali, active, bez sprzedane/kazka).
 *
 * Wymaga: SHOPIFY_ADMIN_TOKEN (read_products, write_products)
 * Uruchom:
 *   node scripts/sync-metal-custom-label-2.mjs --dry-run
 *   node scripts/sync-metal-custom-label-2.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  REQUIRED_TEMPLATE_SUFFIX,
  GOLD_TEMPLATE_SUFFIX,
  classifyMetalLabel,
  isFeedEligibleTemplate,
  isKazkaProduct,
  hasSprzedaneTag,
} from './lib/epir-metal-label.mjs';

const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const PRODUCTS_QUERY_STRING =
  'status:active inventory_total:>0 -tag:sprzedane -tag:kazka';
const META_NAMESPACE = 'mm-google-shopping';
const META_KEY = 'custom_label_2';
const PAGE_SIZE = 25;
const VARIANTS_PAGE_SIZE = 100;
const METASET_CHUNK = 25;
const THROTTLE_MS = 500;

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
if (!process.env.SHOP && process.env.SHOP_DOMAIN) {
  process.env.SHOP = normalizeShopHost(process.env.SHOP_DOMAIN);
}
if (!process.env.SHOP && process.env.SHOPIFY_SHOP_DOMAIN) {
  process.env.SHOP = normalizeShopHost(process.env.SHOPIFY_SHOP_DOMAIN);
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
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

const PRODUCTS_QUERY = `#graphql
  query ProductsForMetalLabel($cursor: String, $query: String!) {
    products(first: ${PAGE_SIZE}, after: $cursor, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        vendor
        tags
        templateSuffix
        variants(first: ${VARIANTS_PAGE_SIZE}) {
          nodes {
            id
            metafield(namespace: "${META_NAMESPACE}", key: "${META_KEY}") {
              value
            }
          }
        }
      }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id key value }
      userErrors { field message }
    }
  }
`;

async function main() {
  console.log(`Shop: ${SHOP}`);
  console.log(`Metafield: ${META_NAMESPACE}.${META_KEY}`);
  console.log(`Templates: ${REQUIRED_TEMPLATE_SUFFIX}, ${GOLD_TEMPLATE_SUFFIX}`);
  console.log(`Tryb: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);
  console.log(`Query: ${PRODUCTS_QUERY_STRING}`);
  console.log('');

  const toSet = [];
  let skipped = 0;
  let alreadyOk = 0;
  let unclassified = 0;
  let page = 0;
  let cursor = null;

  for (;;) {
    page += 1;
    const data = await gql(PRODUCTS_QUERY, {
      cursor,
      query: PRODUCTS_QUERY_STRING,
    });
    const conn = data?.products;
    if (!conn) throw new Error('Brak products');
    const nodes = conn.nodes || [];
    console.log(`Strona ${page}: ${nodes.length} produktów`);

    for (const product of nodes) {
      if (!isFeedEligibleTemplate(product.templateSuffix)) {
        skipped += 1;
        continue;
      }
      if (isKazkaProduct(product.vendor, product.tags) || hasSprzedaneTag(product.tags)) {
        skipped += 1;
        continue;
      }
      const metal = classifyMetalLabel(product.vendor, product.title, product.templateSuffix);
      if (!metal) {
        unclassified += 1;
        console.warn(`[unclassified] ${product.title} | vendor=${product.vendor}`);
        continue;
      }

      for (const variant of product.variants?.nodes || []) {
        const current = variant.metafield?.value?.trim() || '';
        if (current === metal) {
          alreadyOk += 1;
          continue;
        }
        toSet.push({
          ownerId: variant.id,
          namespace: META_NAMESPACE,
          key: META_KEY,
          type: 'single_line_text_field',
          value: metal,
          productTitle: product.title,
          from: current || '(empty)',
        });
      }
    }

    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  console.log('');
  console.log(
    `Do ustawienia: ${toSet.length}, alreadyOk=${alreadyOk}, skipped=${skipped}, unclassified=${unclassified}`,
  );

  if (DRY_RUN) {
    for (const row of toSet.slice(0, 30)) {
      console.log(
        `[dry-run] ${row.productTitle} | ${row.ownerId} | ${row.from} → ${row.value}`,
      );
    }
    if (toSet.length > 30) console.log(`… i ${toSet.length - 30} więcej`);
    console.log(`Podsumowanie (dry-run): would_set=${toSet.length}`);
    return;
  }

  let written = 0;
  let errors = 0;
  for (let i = 0; i < toSet.length; i += METASET_CHUNK) {
    const chunk = toSet.slice(i, i + METASET_CHUNK);
    const metafields = chunk.map(({ ownerId, namespace, key, type, value }) => ({
      ownerId,
      namespace,
      key,
      type,
      value,
    }));
    try {
      const data = await gql(METAFIELDS_SET, { metafields });
      const userErrors = data?.metafieldsSet?.userErrors || [];
      if (userErrors.length) {
        errors += userErrors.length;
        console.error('userErrors:', JSON.stringify(userErrors));
      } else {
        written += chunk.length;
        console.log(`Zapisano chunk ${i / METASET_CHUNK + 1}: ${chunk.length}`);
      }
    } catch (e) {
      errors += chunk.length;
      console.error(`Błąd chunk: ${e.message || e}`);
    }
  }

  console.log(`Podsumowanie: written=${written}, errors=${errors}, alreadyOk=${alreadyOk}`);
  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
