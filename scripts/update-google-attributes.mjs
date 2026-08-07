#!/usr/bin/env node
/**
 * Bulk update metafields Google Shopping na wariantach produktów
 * opublikowanych w kanale Google & YouTube.
 *
 * Metafields (namespace mm-google-shopping, typ single_line_text_field):
 *   gender    → Unisex
 *   age_group → Adult
 *   condition → new
 *
 * Mutacja: productVariantsBulkUpdate (scope: read_products, write_products).
 * Lookup publikacji: read_publications (opcjonalnie — fallback na stałe ID).
 *
 * Operacja na sklepie Liquid (epir-art-silver-jewellery) — Admin API aplikacji epir_ai.
 * Nie używa tokenów Hydrogen (apps/kazka, apps/zareczyny).
 *
 * Wymaga: SHOPIFY_ADMIN_TOKEN
 *   Alias: SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_ACCESS_TOKEN
 * Uruchom:
 *   node scripts/update-google-attributes.mjs --dry-run
 *   node scripts/update-google-attributes.mjs --vendor "EPIR Art Silver Jewellery" --dry-run
 *   node scripts/update-google-attributes.mjs
 */

import {readFileSync, existsSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

/** Zgodnie z `shopify.app.toml` → `[webhooks] api_version = "2026-04"` */
const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const DEFAULT_QUERY = 'status:active';
/** Fallback gdy lookup publications(app handle=google) się nie uda */
const FALLBACK_PUBLICATION_ID = 'gid://shopify/Publication/44911067241';
const GOOGLE_APP_HANDLE = 'google';
const METAFIELD_NAMESPACE = 'mm-google-shopping';
const PAGE_SIZE = 50;
const VARIANTS_PAGE_SIZE = 100;
const THROTTLE_MS = 500;

/** key → wartość docelowa (zapis dokładny; porównanie skip case-insensitive) */
const TARGET_METAFIELDS = {
  gender: 'Unisex',
  age_group: 'Adult',
  condition: 'new',
};

const TARGET_KEYS = Object.keys(TARGET_METAFIELDS);

const DRY_RUN = process.argv.includes('--dry-run');

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

const VENDOR_FILTER = readArg('--vendor');
const PRODUCTS_QUERY_STRING = readArg('--query') || DEFAULT_QUERY;

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

function normalizeVendor(vendor) {
  return String(vendor || '')
    .trim()
    .toLowerCase();
}

function vendorMatchesFilter(vendor) {
  if (!VENDOR_FILTER) return true;
  return normalizeVendor(vendor) === normalizeVendor(VENDOR_FILTER);
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
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${JSON.stringify(json)}`);
  }
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

const PUBLICATIONS_QUERY = `#graphql
  query GooglePublication {
    publications(first: 20, catalogType: APP) {
      nodes {
        id
        catalog {
          ... on AppCatalog {
            apps(first: 1) {
              nodes {
                handle
              }
            }
          }
        }
      }
    }
  }
`;

const PRODUCTS_QUERY = `#graphql
  query ProductsForGoogleAttrs($cursor: String, $query: String!, $publicationId: ID!) {
    products(first: ${PAGE_SIZE}, after: $cursor, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        vendor
        publishedOnPublication(publicationId: $publicationId)
        variants(first: ${VARIANTS_PAGE_SIZE}) {
          nodes {
            id
            metafields(first: 10, namespace: "${METAFIELD_NAMESPACE}") {
              nodes {
                key
                value
              }
            }
          }
        }
      }
    }
  }
`;

const BULK_UPDATE_MUTATION = `#graphql
  mutation ProductVariantsGoogleAttrs($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Resolve Google & YouTube publication ID via app handle `google`.
 * Falls back to FALLBACK_PUBLICATION_ID when lookup fails (e.g. missing read_publications).
 */
async function resolveGooglePublicationId() {
  try {
    const data = await gql(PUBLICATIONS_QUERY);
    const nodes = data?.publications?.nodes || [];
    for (const node of nodes) {
      const apps = node.catalog?.apps?.nodes || [];
      const handle = apps[0]?.handle;
      if (handle === GOOGLE_APP_HANDLE) {
        console.log(`Publication (lookup handle=${GOOGLE_APP_HANDLE}): ${node.id}`);
        return node.id;
      }
    }
    console.warn(
      `Nie znaleziono publication z app handle="${GOOGLE_APP_HANDLE}" — używam fallback: ${FALLBACK_PUBLICATION_ID}`,
    );
  } catch (e) {
    console.warn(
      `Lookup publications nieudany (${e.message || e}) — używam fallback: ${FALLBACK_PUBLICATION_ID}`,
    );
  }
  return FALLBACK_PUBLICATION_ID;
}

/**
 * @param {{nodes?: Array<{key?: string, value?: string}>}|null|undefined} metafieldsConn
 * @returns {Record<string, string>}
 */
function getVariantGoogleAttrs(metafieldsConn) {
  const attrs = {};
  for (const node of metafieldsConn?.nodes || []) {
    if (!node?.key) continue;
    attrs[node.key] = node.value == null ? '' : String(node.value);
  }
  return attrs;
}

/**
 * @param {Record<string, string>} attrs
 * @returns {boolean}
 */
function variantNeedsUpdate(attrs) {
  for (const key of TARGET_KEYS) {
    const current = String(attrs[key] || '').trim();
    const target = TARGET_METAFIELDS[key];
    if (current.toLowerCase() !== target.toLowerCase()) {
      return true;
    }
  }
  return false;
}

/**
 * Tylko pola brakujące lub z inną wartością (case-insensitive).
 * @param {Record<string, string>} attrs
 * @returns {Array<{namespace: string, key: string, value: string, type: string}>}
 */
function buildMetafieldInputs(attrs) {
  const inputs = [];
  for (const key of TARGET_KEYS) {
    const current = String(attrs[key] || '').trim();
    const target = TARGET_METAFIELDS[key];
    if (current.toLowerCase() === target.toLowerCase()) continue;
    inputs.push({
      namespace: METAFIELD_NAMESPACE,
      key,
      value: target,
      type: 'single_line_text_field',
    });
  }
  return inputs;
}

/**
 * Format zmian do logu: gender: (brak)→Unisex, age_group: kid→Adult
 * @param {Record<string, string>} attrs
 * @param {Array<{key: string, value: string}>} metafieldInputs
 */
function formatAttrDiff(attrs, metafieldInputs) {
  return metafieldInputs
    .map((m) => {
      const from = String(attrs[m.key] || '').trim() || '(brak)';
      return `${m.key}: ${from}→${m.value}`;
    })
    .join(', ');
}

/**
 * @param {string} publicationId
 * @returns {Promise<{
 *   updates: Array<{productId: string, productTitle: string, vendor: string, variants: Array<{id: string, metafields: Array<object>, attrs: Record<string, string>, diff: string}>}>,
 *   skippedProducts: number,
 *   skippedVariants: number,
 * }>}
 */
async function collectUpdates(publicationId) {
  const updates = [];
  let skippedProducts = 0;
  let skippedVariants = 0;
  let cursor = null;
  let page = 0;

  for (;;) {
    page += 1;
    const data = await gql(PRODUCTS_QUERY, {
      cursor,
      query: PRODUCTS_QUERY_STRING,
      publicationId,
    });
    const conn = data?.products;
    if (!conn) {
      throw new Error('Brak products w odpowiedzi GraphQL');
    }

    const nodes = conn.nodes || [];
    console.log(`Strona ${page}: pobrano ${nodes.length} produktów`);

    for (const product of nodes) {
      if (product.publishedOnPublication !== true) {
        skippedProducts += 1;
        continue;
      }
      if (!vendorMatchesFilter(product.vendor)) {
        skippedProducts += 1;
        continue;
      }

      const variants = product.variants?.nodes || [];
      if (variants.length === 0) {
        skippedProducts += 1;
        continue;
      }
      if (variants.length >= VARIANTS_PAGE_SIZE) {
        console.warn(
          `Uwaga: ${product.title} | ${product.id} ma ≥${VARIANTS_PAGE_SIZE} wariantów — kolejne strony variants nie są paginowane`,
        );
      }

      const variantsToUpdate = [];
      for (const variant of variants) {
        const attrs = getVariantGoogleAttrs(variant.metafields);
        if (!variantNeedsUpdate(attrs)) {
          skippedVariants += 1;
          continue;
        }
        const metafields = buildMetafieldInputs(attrs);
        if (metafields.length === 0) {
          skippedVariants += 1;
          continue;
        }
        variantsToUpdate.push({
          id: variant.id,
          metafields,
          attrs,
          diff: formatAttrDiff(attrs, metafields),
        });
      }

      if (variantsToUpdate.length === 0) {
        skippedProducts += 1;
        continue;
      }

      updates.push({
        productId: product.id,
        productTitle: product.title,
        vendor: product.vendor,
        variants: variantsToUpdate,
      });
    }

    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  return {updates, skippedProducts, skippedVariants};
}

async function updateProductVariants(productId, variants) {
  const data = await gql(BULK_UPDATE_MUTATION, {
    productId,
    variants: variants.map((v) => ({
      id: v.id,
      metafields: v.metafields,
    })),
  });
  const result = data?.productVariantsBulkUpdate;
  const userErrors = result?.userErrors || [];
  if (userErrors.length > 0) {
    return {ok: false, errors: userErrors};
  }
  return {
    ok: true,
    updatedIds: (result?.productVariants || []).map((v) => v.id),
  };
}

async function main() {
  console.log(`Shop: ${SHOP}`);
  console.log(`API: ${API_VERSION}`);
  console.log(
    `Tryb: ${DRY_RUN ? 'DRY-RUN (bez mutacji)' : 'PRODUCT VARIANTS BULK UPDATE'}`,
  );
  console.log(`Query: ${PRODUCTS_QUERY_STRING}`);
  if (VENDOR_FILTER) {
    console.log(`Filtr vendor: ${VENDOR_FILTER}`);
  }
  console.log(`Namespace: ${METAFIELD_NAMESPACE}`);
  console.log('Target metafields:');
  for (const [key, value] of Object.entries(TARGET_METAFIELDS)) {
    console.log(`  ${key} → ${value}`);
  }
  console.log('');

  const publicationId = await resolveGooglePublicationId();
  console.log(`Publication: ${publicationId}`);
  console.log('');

  const {updates, skippedProducts, skippedVariants} =
    await collectUpdates(publicationId);

  const candidateVariants = updates.reduce((n, u) => n + u.variants.length, 0);

  console.log('');
  console.log(
    `Kandydaci: ${updates.length} produkt(ów), ${candidateVariants} wariant(ów) (pominięto produkty: ${skippedProducts}, warianty OK: ${skippedVariants})`,
  );

  let updatedProducts = 0;
  let updatedVariants = 0;
  let errors = 0;

  if (DRY_RUN) {
    for (const entry of updates) {
      for (const v of entry.variants) {
        console.log(
          `[dry-run] ${entry.productTitle} | vendor=${entry.vendor} | variant=${v.id} | ${v.diff}`,
        );
      }
    }
  } else {
    for (const entry of updates) {
      try {
        const result = await updateProductVariants(
          entry.productId,
          entry.variants,
        );
        if (!result.ok) {
          errors += 1;
          console.error(
            `Błąd: ${entry.productTitle} | ${entry.productId} | ${JSON.stringify(result.errors)}`,
          );
          continue;
        }
        updatedProducts += 1;
        updatedVariants += entry.variants.length;
        for (const v of entry.variants) {
          console.log(
            `Zaktualizowano: ${entry.productTitle} | variant=${v.id} | ${v.diff}`,
          );
        }
      } catch (e) {
        errors += 1;
        console.error(
          `Błąd: ${entry.productTitle} | ${entry.productId} | ${e.message || e}`,
        );
      }
    }
  }

  console.log('');
  if (DRY_RUN) {
    console.log(
      `Podsumowanie (dry-run): produkty=${updates.length}, warianty=${candidateVariants}, pominięto produkty=${skippedProducts}, pominięto warianty=${skippedVariants}, błędy=0`,
    );
  } else {
    console.log(
      `Podsumowanie: zaktualizowano produkty=${updatedProducts}, warianty=${updatedVariants}, błędy=${errors}, pominięto produkty=${skippedProducts}, pominięto warianty=${skippedVariants}`,
    );
  }

  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
