#!/usr/bin/env node
/**
 * Audyt kontraktu EPIR → PMax / GMC (read-only).
 *
 * Eligibility (wszystkie warunki):
 *   status:active, inventory_total:>0
 *   -tag:sprzedane, bez Kazki (vendor/tag)
 *   templateSuffix === nowy-szablon OR pierscionek-zloto-turmali (linia złota)
 *   published on Google & YouTube AND Online Store
 *   classifiable metal → Srebro | Zloto (custom_label_2)
 *
 * Uruchom:
 *   node scripts/audit-epir-shopping-eligibility.mjs
 *   node scripts/audit-epir-shopping-eligibility.mjs --json out.json
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  GY_PUBLICATION_ID,
  REQUIRED_TEMPLATE_SUFFIX,
  GOLD_TEMPLATE_SUFFIX,
  FEED_ELIGIBLE_TEMPLATE_SUFFIXES,
  classifyMetalLabel,
  hasSprzedaneTag,
  isFeedEligibleTemplate,
  isKazkaProduct,
} from './lib/epir-metal-label.mjs';

const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const PRODUCTS_QUERY_STRING = 'status:active';
const PAGE_SIZE = 50;
const THROTTLE_MS = 400;

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

const JSON_OUT = readArg('--json');

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

const PUBLICATIONS_QUERY = `#graphql
  query PublicationsForAudit {
    publications(first: 50) {
      nodes {
        id
        name
        catalog { id title }
        app { handle }
      }
    }
  }
`;

const PRODUCTS_QUERY = `#graphql
  query ProductsEligibility(
    $cursor: String
    $query: String!
    $gyId: ID!
    $osId: ID!
  ) {
    products(first: ${PAGE_SIZE}, after: $cursor, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        vendor
        status
        tags
        templateSuffix
        totalInventory
        publishedOnGy: publishedOnPublication(publicationId: $gyId)
        publishedOnOs: publishedOnPublication(publicationId: $osId)
      }
    }
  }
`;

function resolveOnlineStorePublicationId(nodes) {
  for (const n of nodes || []) {
    const name = String(n.name || '').toLowerCase();
    const handle = String(n.app?.handle || '').toLowerCase();
    if (handle === 'online_store' || name.includes('online store')) {
      return n.id;
    }
  }
  return null;
}

/**
 * @param {object} node
 * @returns {{ bucket: string, metal: string|null, reasons: string[] }}
 */
function classifyProduct(node) {
  const tags = node.tags || [];
  const reasons = [];
  const metal = classifyMetalLabel(node.vendor, node.title, node.templateSuffix);

  if (node.status !== 'ACTIVE') reasons.push('not_active');
  if ((node.totalInventory ?? 0) <= 0) reasons.push('out_of_stock');
  if (hasSprzedaneTag(tags)) reasons.push('sprzedane');
  if (isKazkaProduct(node.vendor, tags)) reasons.push('kazka');
  if (!isFeedEligibleTemplate(node.templateSuffix)) reasons.push('wrong_template');
  if (node.publishedOnGy !== true) reasons.push('missing_gy');
  if (node.publishedOnOs !== true) reasons.push('missing_online_store');
  if (!metal) reasons.push('unclassified_metal');

  const eligible = reasons.length === 0;
  let bucket = 'eligible';
  if (!eligible) {
    if (reasons.includes('sprzedane')) bucket = 'sprzedane';
    else if (reasons.includes('kazka')) bucket = 'kazka';
    else if (reasons.includes('wrong_template')) bucket = 'wrong_template';
    else if (reasons.includes('missing_online_store')) bucket = 'missing_online_store';
    else if (reasons.includes('missing_gy')) bucket = 'missing_gy';
    else if (reasons.includes('unclassified_metal')) bucket = 'unclassified_metal';
    else if (reasons.includes('out_of_stock')) bucket = 'out_of_stock';
    else bucket = 'other';
  }

  return { bucket, metal, reasons, eligible };
}

async function main() {
  console.log(`Shop: ${SHOP}`);
  console.log(`API: ${API_VERSION}`);
  console.log(`Required templates: ${REQUIRED_TEMPLATE_SUFFIX}, ${GOLD_TEMPLATE_SUFFIX}`);
  console.log(`G&YT publication: ${GY_PUBLICATION_ID}`);
  console.log('');

  const pubData = await gql(PUBLICATIONS_QUERY);
  const pubNodes = pubData?.publications?.nodes || [];
  const osId = resolveOnlineStorePublicationId(pubNodes);
  if (!osId) {
    console.error('Nie znaleziono publication Online Store — sprawdź scope read_publications.');
    console.error(
      'Znalezione:',
      pubNodes.map((n) => `${n.name} (${n.app?.handle || '?'}) ${n.id}`).join('; '),
    );
    process.exit(1);
  }
  console.log(`Online Store publication: ${osId}`);

  const counts = {
    eligible: 0,
    wrong_template: 0,
    sprzedane: 0,
    kazka: 0,
    missing_online_store: 0,
    missing_gy: 0,
    unclassified_metal: 0,
    out_of_stock: 0,
    other: 0,
    total: 0,
  };
  const metalCounts = { Srebro: 0, Zloto: 0, null: 0 };
  const samples = {
    eligible: [],
    wrong_template: [],
    kazka: [],
    missing_online_store: [],
    missing_gy: [],
    unclassified_metal: [],
  };
  const rows = [];

  let cursor = null;
  let page = 0;
  for (;;) {
    page += 1;
    const data = await gql(PRODUCTS_QUERY, {
      cursor,
      query: PRODUCTS_QUERY_STRING,
      gyId: GY_PUBLICATION_ID,
      osId,
    });
    const conn = data?.products;
    if (!conn) throw new Error('Brak products w odpowiedzi');
    const nodes = conn.nodes || [];
    console.log(`Strona ${page}: ${nodes.length} produktów`);

    for (const node of nodes) {
      counts.total += 1;
      const { bucket, metal, reasons, eligible } = classifyProduct(node);
      counts[bucket] = (counts[bucket] || 0) + 1;
      metalCounts[metal ?? 'null'] = (metalCounts[metal ?? 'null'] || 0) + 1;

      const row = {
        id: node.id,
        title: node.title,
        handle: node.handle,
        vendor: node.vendor,
        templateSuffix: node.templateSuffix,
        totalInventory: node.totalInventory,
        publishedOnGy: node.publishedOnGy,
        publishedOnOs: node.publishedOnOs,
        metal,
        eligible,
        bucket,
        reasons,
      };
      rows.push(row);

      if (samples[bucket] && samples[bucket].length < 5) {
        samples[bucket].push(`${node.title} | ${node.vendor} | suffix=${node.templateSuffix || '(default)'}`);
      }
    }

    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  const report = {
    shop: SHOP,
    generatedAt: new Date().toISOString(),
    gyPublicationId: GY_PUBLICATION_ID,
    onlineStorePublicationId: osId,
    requiredTemplates: FEED_ELIGIBLE_TEMPLATE_SUFFIXES,
    counts,
    metalCounts,
    samples,
  };

  console.log('');
  console.log('=== Podsumowanie kontraktu EPIR → PMax ===');
  console.log(JSON.stringify(counts, null, 2));
  console.log('Metale (wszystkie aktywne):', metalCounts);
  console.log('');
  for (const [k, list] of Object.entries(samples)) {
    if (!list.length) continue;
    console.log(`Przykłady ${k}:`);
    for (const s of list) console.log(`  - ${s}`);
  }

  if (JSON_OUT) {
    writeFileSync(
      JSON_OUT,
      JSON.stringify({ ...report, products: rows }, null, 2),
      'utf8',
    );
    console.log(`\nZapisano: ${JSON_OUT}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
