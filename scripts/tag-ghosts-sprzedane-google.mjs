#!/usr/bin/env node
/**
 * Dodaje tag `sprzedane` do „duchów” w Google & YouTube:
 * aktywne, inventory_total:0, opublikowane w G&YT, default template (bez templateSuffix),
 * bez tagu sprzedane.
 *
 * Operacja na sklepie Liquid (epir-art-silver-jewellery) — Admin API aplikacji epir_ai.
 * Nie używa tokenów Hydrogen (apps/kazka, apps/zareczyny).
 *
 * Wymaga: SHOPIFY_ADMIN_TOKEN (scope: read_products, write_products)
 *   Alias: SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_ACCESS_TOKEN
 * Uruchom:
 *   node scripts/tag-ghosts-sprzedane-google.mjs --dry-run
 *   node scripts/tag-ghosts-sprzedane-google.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/** Zgodnie z `shopify.app.toml` → `[webhooks] api_version = "2026-04"` */
const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const PUBLICATION_ID = 'gid://shopify/Publication/44911067241';
/** Filtr serwera — publication + stock 0; reszta lokalnie */
const PRODUCTS_QUERY_STRING =
  'status:active inventory_total:0 publication_ids:44911067241';
const TAG = 'sprzedane';
const PAGE_SIZE = 50;
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
if (!process.env.SHOP) {
  process.env.SHOP = DEFAULT_SHOP;
}

const SHOP = process.env.SHOP;
const TOKEN = resolveAdminToken();

if (!TOKEN) {
  console.error(
    'Brak SHOPIFY_ADMIN_TOKEN (token Admin API sklepu Liquid / epir_ai).',
  );
  console.error(
    'Ustaw env lub root/.dev.vars — nie używaj tokenów z apps/kazka ani apps/zareczyny.',
  );
  console.error('Wymagane scope: read_products, write_products');
  process.exit(1);
}

const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Default product template: templateSuffix IS NULL OR empty */
function isDefaultTemplate(s) {
  return s == null || String(s).trim() === '';
}

function hasTag(tags, tag) {
  const needle = String(tag).toLowerCase();
  return (tags || []).some((t) => String(t).toLowerCase() === needle);
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
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${JSON.stringify(json)}`);
  }
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

const PRODUCTS_QUERY = `#graphql
  query GhostsForSprzedaneTag($cursor: String, $query: String!, $publicationId: ID!) {
    products(first: ${PAGE_SIZE}, after: $cursor, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        templateSuffix
        tags
        publishedOnPublication(publicationId: $publicationId)
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

async function collectCandidates() {
  const toTag = [];
  let skipped = 0;
  let cursor = null;
  let page = 0;

  for (;;) {
    page += 1;
    const data = await gql(PRODUCTS_QUERY, {
      cursor,
      query: PRODUCTS_QUERY_STRING,
      publicationId: PUBLICATION_ID,
    });
    const conn = data?.products;
    if (!conn) {
      throw new Error('Brak products w odpowiedzi GraphQL');
    }

    const nodes = conn.nodes || [];
    console.log(`Strona ${page}: pobrano ${nodes.length} produktów`);

    for (const node of nodes) {
      // Safety: nadal wymagamy publikacji G&YT (gdyby search był niedokładny)
      if (node.publishedOnPublication !== true) {
        skipped += 1;
        continue;
      }
      if (!isDefaultTemplate(node.templateSuffix)) {
        skipped += 1;
        continue;
      }
      if (hasTag(node.tags, TAG)) {
        skipped += 1;
        continue;
      }
      toTag.push({ id: node.id, title: node.title });
    }

    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  return { toTag, skipped };
}

async function addSprzedaneTag(product) {
  const data = await gql(TAGS_ADD_MUTATION, {
    id: product.id,
    tags: [TAG],
  });
  const result = data?.tagsAdd;
  const userErrors = result?.userErrors || [];
  if (userErrors.length > 0) {
    return { ok: false, errors: userErrors };
  }
  return {
    ok: true,
    id: result?.node?.id || product.id,
    title: result?.node?.title || product.title,
  };
}

async function main() {
  console.log(`Shop: ${SHOP}`);
  console.log(`Publication: ${PUBLICATION_ID}`);
  console.log(`API: ${API_VERSION}`);
  console.log(`Tag: ${TAG}`);
  console.log(`Tryb: ${DRY_RUN ? 'DRY-RUN (bez mutacji)' : 'TAGS ADD'}`);
  console.log(`Query: ${PRODUCTS_QUERY_STRING}`);
  console.log('');

  const { toTag, skipped } = await collectCandidates();

  console.log('');
  console.log(
    `Kandydaci do tagu "${TAG}": ${toTag.length} (pominięto wcześniej: ${skipped})`,
  );

  let tagged = 0;
  let errors = 0;

  if (DRY_RUN) {
    for (const p of toTag) {
      console.log(`[dry-run] ${p.title} | ${p.id}`);
    }
  } else {
    for (const p of toTag) {
      try {
        const result = await addSprzedaneTag(p);
        if (!result.ok) {
          errors += 1;
          console.error(
            `Błąd: ${p.title} | ${p.id} | ${JSON.stringify(result.errors)}`,
          );
          continue;
        }
        tagged += 1;
        console.log(`Otagowano: ${result.title} | ${result.id}`);
      } catch (e) {
        errors += 1;
        console.error(`Błąd: ${p.title} | ${p.id} | ${e.message || e}`);
      }
    }
  }

  console.log('');
  if (DRY_RUN) {
    console.log(
      `Podsumowanie (dry-run): kandydaci=${toTag.length}, pominięto=${skipped} (nie G&YT / ma templateSuffix / już sprzedane), błędy=0`,
    );
  } else {
    console.log(
      `Podsumowanie: otagowano=${tagged}, błędy=${errors}, pominięto=${skipped} (nie G&YT / ma templateSuffix / już sprzedane)`,
    );
  }

  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
