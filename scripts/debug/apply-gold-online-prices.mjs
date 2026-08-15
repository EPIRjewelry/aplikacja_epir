#!/usr/bin/env node
/**
 * Wgraj wybrane ceny brutto na warianty złota (Online Store).
 * Mutacja: productVariantsBulkUpdate. Zero innych pól.
 *
 *   node scripts/debug/apply-gold-online-prices.mjs --dry-run
 *   node scripts/debug/apply-gold-online-prices.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const THROTTLE_MS = 500;
const VARIANTS_PAGE = 100;

/** Tylko ACTIVE. Szkice (np. turmalin gałązki) poza listą. */
const TARGETS = {
  'obraczki-zlote-mlotkowane-1': { 333: '1868.00', 585: '2490.00' },
  'zlota-obraczka-galazka': { 333: '1868.00', 585: '2490.00' },
  'zloty-pierscionek-z-ametystem-epir': { 333: '2200.00', 585: '2990.00' },
  'zloty-pierscionek-z-szafirem': { 333: '2490.00', 585: '3290.00' },
  'zloty-pierscionek-z-naturalnym-szafirem': { 585: '2790.00' },
  'pierscionek-zloty-z-topazem-swiss-blue': { 333: '2800.00', 585: '3690.00' },
  'zloty-pierscionek-z-dwoma-opalami': { 333: '3990.00', 585: '5290.00' },
};

const DRY_RUN = process.argv.includes('--dry-run');

const dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(dir, '../..');

function trimVal(line) {
  return line.trim().replace(/^['"]|['"]$/g, '');
}

function normalizeShopHost(raw) {
  let s = trimVal(raw);
  s = s.replace(/^https?:\/\//i, '').split('/')[0];
  return s;
}

function loadFromDevVars() {
  const paths = [join(ROOT, '.dev.vars'), join(ROOT, 'workers/chat/.dev.vars')];
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
    if (token || shop) return { token, shop };
  }
  return { token: null, shop: null };
}

const fromDev = loadFromDevVars();
const TOKEN =
  process.env.SHOPIFY_ADMIN_TOKEN ||
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
  process.env.SHOPIFY_ACCESS_TOKEN ||
  fromDev.token;
let SHOP = process.env.SHOP || fromDev.shop || DEFAULT_SHOP;
SHOP = normalizeShopHost(SHOP);

if (!TOKEN) {
  console.error('Brak SHOPIFY_ADMIN_TOKEN');
  process.exit(1);
}

const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

function variantFineness(variant) {
  const bits = [variant.title];
  for (const o of variant.selectedOptions || []) {
    bits.push(o.name, o.value);
  }
  const lower = bits.filter(Boolean).join(' ').toLowerCase();
  if (/\b750\b/.test(lower) || /\b18\s*k\b/.test(lower)) return 750;
  if (/\b585\b/.test(lower) || /\b14\s*k\b/.test(lower)) return 585;
  if (/\b333\b/.test(lower) || /\b8\s*k\b/.test(lower)) return 333;
  return null;
}

function priceForVariant(handle, variant) {
  const map = TARGETS[handle];
  const keys = Object.keys(map).map(Number);
  const vf = variantFineness(variant);
  if (vf && map[vf]) return map[vf];
  if (keys.length === 1) return map[keys[0]];
  if (map[585]) return map[585];
  return map[keys[0]];
}

const PRODUCT_QUERY = `#graphql
  query GoldPriceProduct($query: String!) {
    products(first: 1, query: $query) {
      nodes {
        id
        handle
        title
        status
        variants(first: ${VARIANTS_PAGE}) {
          nodes {
            id
            title
            price
            selectedOptions { name value }
          }
        }
      }
    }
  }
`;

const MUTATION = `#graphql
  mutation GoldPriceBulk($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price }
      userErrors { field message }
    }
  }
`;

async function main() {
  console.log(DRY_RUN ? 'DRY-RUN' : 'WGRYWAM', 'ceny na', SHOP);
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const handle of Object.keys(TARGETS)) {
    const data = await gql(PRODUCT_QUERY, { query: `handle:${handle}` });
    const node = data?.products?.nodes?.[0];
    if (!node) {
      console.error('BRAK', handle);
      errors += 1;
      continue;
    }
    if (node.status !== 'ACTIVE') {
      console.log('POMINIĘTO szkic', handle);
      continue;
    }
    const variants = node.variants?.nodes || [];
    const inputs = [];
    for (const v of variants) {
      const next = priceForVariant(handle, v);
      if (!next) continue;
      if (Number(v.price).toFixed(2) === Number(next).toFixed(2)) {
        skipped += 1;
        continue;
      }
      inputs.push({ id: v.id, price: next });
    }
    if (inputs.length === 0) {
      console.log('OK skip', handle, `(już zgodne, ${variants.length} wariantów)`);
      continue;
    }
    console.log(`${handle}: ${inputs.length} wariantów`);
    for (const row of inputs.slice(0, 4)) {
      const old = variants.find((v) => v.id === row.id);
      console.log(`  ${old?.title}: ${old?.price} → ${row.price}`);
    }
    if (inputs.length > 4) console.log(`  … +${inputs.length - 4}`);
    if (DRY_RUN) {
      updated += inputs.length;
      continue;
    }
    const chunk = 50;
    for (let i = 0; i < inputs.length; i += chunk) {
      const part = inputs.slice(i, i + chunk);
      const out = await gql(MUTATION, { productId: node.id, variants: part });
      const ue = out?.productVariantsBulkUpdate?.userErrors || [];
      if (ue.length) {
        console.error(handle, ue);
        errors += 1;
      } else {
        updated += part.length;
      }
    }
  }

  console.log(JSON.stringify({ dryRun: DRY_RUN, updated, skipped, errors }));
  if (errors) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
