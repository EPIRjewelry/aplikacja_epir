#!/usr/bin/env node
/**
 * Publikuje aktywne produkty z niepustym templateSuffix do Google & YouTube.
 *
 * Filtry serwera (Shopify Search):
 *   status:active inventory_total:>0 -tag:sprzedane -tag:kazka
 * Filtry klienta:
 *   templateSuffix IS NOT NULL AND templateSuffix != ""
 *   publishedOnPublication(Google & YouTube) === false
 *
 * Operacja na sklepie Liquid (epir-art-silver-jewellery) — Admin API aplikacji epir_ai.
 * Nie używa tokenów Hydrogen (apps/kazka, apps/zareczyny).
 *
 * Wymaga: SHOPIFY_ADMIN_TOKEN (scope: read_products, write_publications)
 *   Alias: SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_ACCESS_TOKEN
 *   Opcjonalnie root .dev.vars / scripts/.dev.vars (bez apps/*)
 * Uruchom:
 *   node scripts/publish-products-google-youtube.mjs --dry-run
 *   node scripts/publish-products-google-youtube.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/** Zgodnie z `shopify.app.toml` → `[webhooks] api_version = "2026-04"` */
const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const PUBLICATION_ID = 'gid://shopify/Publication/44911067241';
const PRODUCTS_QUERY_STRING =
  'status:active inventory_total:>0 -tag:sprzedane -tag:kazka';
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

/**
 * Token Admin sklepu Liquid — tylko root / scripts/.dev.vars.
 * Świadomie pomija apps/kazka i apps/zareczyny (Hydrogen Storefront).
 */
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
  console.error('Wymagane scope: read_products, write_publications');
  process.exit(1);
}

const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** templateSuffix IS NOT NULL AND templateSuffix != "" */
function hasTemplateSuffix(s) {
  return s != null && String(s).trim() !== '';
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
  query ProductsForGooglePublish($cursor: String, $query: String!, $publicationId: ID!) {
    products(first: ${PAGE_SIZE}, after: $cursor, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        templateSuffix
        publishedOnPublication(publicationId: $publicationId)
      }
    }
  }
`;

const PUBLISH_MUTATION = `#graphql
  mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      publishable {
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

/**
 * Paginacja + filtr klienta. Zwraca { toPublish, skipped }.
 */
async function collectCandidates() {
  const toPublish = [];
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
      if (!hasTemplateSuffix(node.templateSuffix)) {
        skipped += 1;
        continue;
      }
      if (node.publishedOnPublication === true) {
        skipped += 1;
        continue;
      }
      toPublish.push({ id: node.id, title: node.title, templateSuffix: node.templateSuffix });
    }

    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  return { toPublish, skipped };
}

async function publishProduct(product) {
  const data = await gql(PUBLISH_MUTATION, {
    id: product.id,
    input: [{ publicationId: PUBLICATION_ID }],
  });
  const result = data?.publishablePublish;
  const userErrors = result?.userErrors || [];
  if (userErrors.length > 0) {
    return { ok: false, errors: userErrors };
  }
  const published = result?.publishable;
  return {
    ok: true,
    id: published?.id || product.id,
    title: published?.title || product.title,
  };
}

async function main() {
  console.log(`Shop: ${SHOP}`);
  console.log(`Publication: ${PUBLICATION_ID}`);
  console.log(`API: ${API_VERSION}`);
  console.log(`Tryb: ${DRY_RUN ? 'DRY-RUN (bez mutacji)' : 'PUBLIKACJA'}`);
  console.log(`Query: ${PRODUCTS_QUERY_STRING}`);
  console.log('');

  const { toPublish, skipped } = await collectCandidates();

  console.log('');
  console.log(
    `Kandydaci do publikacji: ${toPublish.length} (pominięto wcześniej: ${skipped})`,
  );

  let published = 0;
  let errors = 0;

  if (DRY_RUN) {
    for (const p of toPublish) {
      console.log(`[dry-run] ${p.title} | ${p.id} | templateSuffix=${p.templateSuffix}`);
    }
  } else {
    for (const p of toPublish) {
      try {
        const result = await publishProduct(p);
        if (!result.ok) {
          errors += 1;
          console.error(
            `Błąd: ${p.title} | ${p.id} | ${JSON.stringify(result.errors)}`,
          );
          continue;
        }
        published += 1;
        console.log(`Opublikowano: ${result.title} | ${result.id}`);
      } catch (e) {
        errors += 1;
        console.error(`Błąd: ${p.title} | ${p.id} | ${e.message || e}`);
      }
    }
  }

  console.log('');
  if (DRY_RUN) {
    console.log(
      `Podsumowanie (dry-run): kandydaci=${toPublish.length}, pominięto=${skipped} (już opublikowane / brak templateSuffix), błędy=0`,
    );
  } else {
    console.log(
      `Podsumowanie: opublikowano=${published}, błędy=${errors}, pominięto=${skipped} (już opublikowane / brak templateSuffix)`,
    );
  }

  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
