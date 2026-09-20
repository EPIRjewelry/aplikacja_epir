#!/usr/bin/env node
/**
 * Dodaje tag `kazka-lab` do produktów LAB w kolekcji Kazka.
 *
 * Kandydaci (bez tagu kazka-lab):
 *   - tag `lab` (case-insensitive), lub
 *   - wariant z opcją Jakość = LAB
 *
 * Operacja na sklepie Liquid (epir-art-silver-jewellery) — Admin API epir_ai.
 * Mutacja: tagsAdd (idempotentnie).
 *
 * Wymaga: SHOPIFY_ADMIN_TOKEN (read_products, write_products)
 *   Alias: SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_ACCESS_TOKEN
 *   Domena: SHOPIFY_STORE_DOMAIN, SHOP, SHOPIFY_SHOP_DOMAIN
 *
 * Uruchom:
 *   node scripts/tag-kazka-lab.mjs          → dry-run (domyślnie)
 *   node scripts/tag-kazka-lab.mjs --apply  → faktyczne tagowanie
 */

import {readFileSync, existsSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

/** Zgodnie z `shopify.app.toml` → `[webhooks] api_version = "2026-04"` */
const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const COLLECTION_ID = 'gid://shopify/Collection/674812330316';
const SOURCE_TAG = 'lab';
const TAG_TO_ADD = 'kazka-lab';
const QUALITY_OPTION = 'Jakość';
const QUALITY_LAB = 'LAB';
const PAGE_SIZE = 50;
const THROTTLE_MS = 500;
const DRY_RUN_PREVIEW_LIMIT = 10;

const DRY_RUN = !process.argv.includes('--apply');

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
  console.error(
    'Brak SHOPIFY_ADMIN_TOKEN (token Admin API sklepu Liquid / epir_ai).',
  );
  console.error(
    'Ustaw env lub root/.dev.vars — nie używaj tokenów z apps/kazka ani apps/zareczyny.',
  );
  process.exit(1);
}

const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasTag(tags, tag) {
  const needle = String(tag).toLowerCase();
  return (tags || []).some((t) => String(t).toLowerCase() === needle);
}

function hasLabVariant(product) {
  const variants = product.variants?.nodes ?? [];
  return variants.some((variant) =>
    (variant.selectedOptions ?? []).some(
      (opt) =>
        String(opt.name).trim() === QUALITY_OPTION &&
        String(opt.value).trim().toUpperCase() === QUALITY_LAB,
    ),
  );
}

function isLabProduct(product) {
  return hasTag(product.tags, SOURCE_TAG) || hasLabVariant(product);
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
          tags
          variants(first: 25) {
            nodes {
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
    }
  }
`;

const TAGS_ADD_MUTATION = `#graphql
  mutation tagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node {
        ... on Product {
          id
          title
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function fetchAllCollectionProducts() {
  const products = [];
  let cursor = null;
  let page = 0;
  let collectionTitle = '';

  for (;;) {
    page += 1;
    const data = await gql(COLLECTION_PRODUCTS, {id: COLLECTION_ID, cursor});
    const collection = data?.collection;
    if (!collection) throw new Error(`Brak kolekcji ${COLLECTION_ID}`);

    collectionTitle = collection.title ?? collectionTitle;
    const conn = collection.products;
    const nodes = conn?.nodes ?? [];
    console.log(
      `Strona ${page}: ${nodes.length} produktów (kolekcja: ${collectionTitle})`,
    );

    products.push(...nodes);

    if (!conn?.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  return {products, collectionTitle};
}

function selectCandidates(products) {
  const labProducts = products.filter(isLabProduct);
  const toTag = labProducts.filter((p) => !hasTag(p.tags, TAG_TO_ADD));
  const alreadyTagged = labProducts.length - toTag.length;

  const withLabTag = labProducts.filter((p) => hasTag(p.tags, SOURCE_TAG));
  const withLabVariant = labProducts.filter((p) => hasLabVariant(p));

  return {labProducts, toTag, alreadyTagged, withLabTag, withLabVariant};
}

async function addKazkaLabTag(product) {
  const data = await gql(TAGS_ADD_MUTATION, {
    id: product.id,
    tags: [TAG_TO_ADD],
  });
  const result = data?.tagsAdd;
  const userErrors = result?.userErrors ?? [];
  if (userErrors.length > 0) {
    return {ok: false, errors: userErrors};
  }
  return {
    ok: true,
    id: result?.node?.id || product.id,
    title: result?.node?.title || product.title,
  };
}

async function main() {
  console.log(`Shop: ${SHOP}`);
  console.log(`Collection: ${COLLECTION_ID}`);
  console.log(`API: ${API_VERSION}`);
  console.log(
    `Źródło: tag "${SOURCE_TAG}" lub wariant ${QUALITY_OPTION}=${QUALITY_LAB} → dodaj "${TAG_TO_ADD}"`,
  );
  console.log(`Tryb: ${DRY_RUN ? 'DRY-RUN (bez mutacji)' : 'TAGS ADD'}`);
  console.log('');

  const {products, collectionTitle} = await fetchAllCollectionProducts();
  const {labProducts, toTag, alreadyTagged, withLabTag, withLabVariant} =
    selectCandidates(products);

  console.log('');
  console.log(`Kolekcja: ${collectionTitle}`);
  console.log(`Produktów w kolekcji: ${products.length}`);
  console.log(`Produktów LAB (tag lub wariant): ${labProducts.length}`);
  console.log(`  — z tagiem ${SOURCE_TAG}: ${withLabTag.length}`);
  console.log(`  — z wariantem ${QUALITY_OPTION}=${QUALITY_LAB}: ${withLabVariant.length}`);
  console.log(`Już z tagiem ${TAG_TO_ADD}: ${alreadyTagged}`);
  console.log(`Do otagowania: ${toTag.length}`);

  if (labProducts.length === 0) {
    console.error('');
    console.error(
      `HARD STOP: brak produktów LAB (tag "${SOURCE_TAG}" lub wariant ${QUALITY_OPTION}=${QUALITY_LAB}) w kolekcji Kazka.`,
    );
    console.error(
      'Nie uruchamiaj --apply ani nie deployuj linii Big Lab, dopóki źródło nie istnieje.',
    );
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('');
    console.log('DRY-RUN — brak zmian. Uruchom z --apply żeby zapisać.');
    for (const product of toTag.slice(0, DRY_RUN_PREVIEW_LIMIT)) {
      const viaTag = hasTag(product.tags, SOURCE_TAG) ? 'tag' : '';
      const viaVariant = hasLabVariant(product) ? 'wariant' : '';
      const reason = [viaTag, viaVariant].filter(Boolean).join('+');
      console.log(`[dry-run] ${product.title} | ${product.id} | ${reason}`);
    }
    if (toTag.length > DRY_RUN_PREVIEW_LIMIT) {
      console.log(
        `... i ${toTag.length - DRY_RUN_PREVIEW_LIMIT} więcej kandydatów`,
      );
    }
    console.log('');
    console.log(
      `Podsumowanie (dry-run): do_otagowania=${toTag.length}, już_otagowane=${alreadyTagged}`,
    );
    return;
  }

  let tagged = 0;
  let errors = 0;

  for (const product of toTag) {
    try {
      const result = await addKazkaLabTag(product);
      if (!result.ok) {
        errors += 1;
        console.error(
          `Błąd: ${product.title} | ${product.id} | ${JSON.stringify(result.errors)}`,
        );
        continue;
      }
      tagged += 1;
      console.log(`Otagowano: ${result.title} | ${result.id}`);
    } catch (e) {
      errors += 1;
      console.error(`Błąd: ${product.title} | ${product.id} | ${e.message || e}`);
    }
  }

  console.log('');
  console.log(
    `Podsumowanie: otagowano=${tagged}, błędy=${errors}, już_otagowane=${alreadyTagged}`,
  );

  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
