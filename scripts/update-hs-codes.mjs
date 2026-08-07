#!/usr/bin/env node
/**
 * Bulk update kodów HS (harmonized system) na InventoryItem produktów biżuteryjnych.
 *
 * Mapowanie po vendorze (case-insensitive):
 *   EPIR Art Silver Jewellery     → 7113110000 (srebro)
 *   EPIR Art Jewellery&Gemstone   → 7113110000 (domyślnie srebro; złoto lite → 711319)
 *   Kazka                         → 7113110000
 *   EPIR Art Gold                 → 7113190000
 *
 * Nadpisanie: tytuł wskazujący na złoto lite (nie pozłacane / nie „Złoty piasek”) → 7113190000.
 *
 * Od API 2024-07 kod HS jest na InventoryItem — nie na Product/Variant.
 * Mutacja: inventoryItemUpdate (scope: read_products, write_inventory).
 *
 * Operacja na sklepie Liquid (epir-art-silver-jewellery) — Admin API aplikacji epir_ai.
 * Nie używa tokenów Hydrogen (apps/kazka, apps/zareczyny).
 *
 * Wymaga: SHOPIFY_ADMIN_TOKEN
 *   Alias: SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_ACCESS_TOKEN
 * Uruchom:
 *   node scripts/update-hs-codes.mjs --dry-run
 *   node scripts/update-hs-codes.mjs --vendor "EPIR Art Silver Jewellery" --dry-run
 *   node scripts/update-hs-codes.mjs
 */

import {readFileSync, existsSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

/** Zgodnie z `shopify.app.toml` → `[webhooks] api_version = "2026-04"` */
const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const DEFAULT_QUERY = 'status:active';
const PAGE_SIZE = 50;
const VARIANTS_PAGE_SIZE = 100;
const THROTTLE_MS = 500;

const HS_SILVER = '7113110000';
const HS_GOLD = '7113190000';

/** vendor (lowercase) → globalny kod HS */
const VENDOR_HS_MAP = {
  'epir art silver jewellery': HS_SILVER,
  'epir art jewellery&gemstone': HS_SILVER,
  kazka: HS_SILVER,
  'epir art silver': HS_SILVER,
  'epir art gold': HS_GOLD,
};

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
  console.error('Wymagane scope: read_products, write_inventory');
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

/**
 * Złoto lite z tytułu — wyklucza pozłotę i metaforyczne „Złoty piasek/pył/powiew”.
 * @param {string|null|undefined} title
 */
function isSolidGoldTitle(title) {
  const t = String(title || '').toLowerCase();
  if (!t) return false;
  if (/pozłac|pozlac|gold[\s-]?plat/.test(t)) return false;
  if (/srebr|silver|\b925\b/.test(t)) return false;
  if (/złoty\s+(piasek|pył|pyl|powiew)/.test(t)) return false;
  return (
    /żółt\w*\s+złot/.test(t) ||
    /\b(14|18)\s*k\b/.test(t) ||
    /\bau\s?(585|750)\b/.test(t) ||
    /\bzłot[yae]\s+(pierścionek|obrączka|obraczka|wisior|naszyjnik|bransolet|kolczyk)/.test(
      t,
    ) ||
    /\b(pierścionek|obrączka|obraczka|wisior|naszyjnik|bransolet|kolczyk)\w*\s+złot/.test(
      t,
    )
  );
}

/**
 * @param {string|null|undefined} vendor
 * @param {string|null|undefined} [title]
 */
function resolveHsCode(vendor, title) {
  if (isSolidGoldTitle(title)) return HS_GOLD;
  return VENDOR_HS_MAP[normalizeVendor(vendor)] || null;
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

const PRODUCTS_QUERY = `#graphql
  query ProductsForHsCodes($cursor: String, $query: String!) {
    products(first: ${PAGE_SIZE}, after: $cursor, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        vendor
        productType
        variants(first: ${VARIANTS_PAGE_SIZE}) {
          nodes {
            id
            inventoryItem {
              id
              harmonizedSystemCode
            }
          }
        }
      }
    }
  }
`;

const INVENTORY_ITEM_UPDATE = `#graphql
  mutation InventoryItemHsUpdate($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      inventoryItem {
        id
        harmonizedSystemCode
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * @returns {Promise<{updates: Array<object>, skippedProducts: number, skippedItems: number}>}
 */
async function collectUpdates() {
  const updates = [];
  const seenInventoryItems = new Set();
  let skippedProducts = 0;
  let skippedItems = 0;
  let cursor = null;
  let page = 0;

  for (;;) {
    page += 1;
    const data = await gql(PRODUCTS_QUERY, {
      cursor,
      query: PRODUCTS_QUERY_STRING,
    });
    const conn = data?.products;
    if (!conn) {
      throw new Error('Brak products w odpowiedzi GraphQL');
    }

    const nodes = conn.nodes || [];
    console.log(`Strona ${page}: pobrano ${nodes.length} produktów`);

    for (const product of nodes) {
      if (!vendorMatchesFilter(product.vendor)) {
        skippedProducts += 1;
        continue;
      }

      const hsCode = resolveHsCode(product.vendor, product.title);
      if (!hsCode) {
        skippedProducts += 1;
        continue;
      }

      const variants = product.variants?.nodes || [];
      if (variants.length === 0) {
        skippedProducts += 1;
        continue;
      }

      let productHasWork = false;
      for (const variant of variants) {
        const item = variant.inventoryItem;
        if (!item?.id) {
          skippedItems += 1;
          continue;
        }
        if (seenInventoryItems.has(item.id)) {
          continue;
        }
        seenInventoryItems.add(item.id);

        const current = item.harmonizedSystemCode || '';
        if (current === hsCode) {
          skippedItems += 1;
          continue;
        }

        productHasWork = true;
        updates.push({
          inventoryItemId: item.id,
          productId: product.id,
          productTitle: product.title,
          vendor: product.vendor,
          productType: product.productType,
          variantId: variant.id,
          from: current || '(brak)',
          to: hsCode,
        });
      }

      if (!productHasWork) {
        skippedProducts += 1;
      }
    }

    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  return {updates, skippedProducts, skippedItems};
}

async function updateInventoryItemHs(entry) {
  const data = await gql(INVENTORY_ITEM_UPDATE, {
    id: entry.inventoryItemId,
    input: {harmonizedSystemCode: entry.to},
  });
  const result = data?.inventoryItemUpdate;
  const userErrors = result?.userErrors || [];
  if (userErrors.length > 0) {
    return {ok: false, errors: userErrors};
  }
  return {
    ok: true,
    harmonizedSystemCode: result?.inventoryItem?.harmonizedSystemCode || entry.to,
  };
}

async function main() {
  console.log(`Shop: ${SHOP}`);
  console.log(`API: ${API_VERSION}`);
  console.log(`Tryb: ${DRY_RUN ? 'DRY-RUN (bez mutacji)' : 'INVENTORY ITEM UPDATE'}`);
  console.log(`Query: ${PRODUCTS_QUERY_STRING}`);
  if (VENDOR_FILTER) {
    console.log(`Filtr vendor: ${VENDOR_FILTER}`);
  }
  console.log('Mapowanie vendor → HS:');
  for (const [vendor, code] of Object.entries(VENDOR_HS_MAP)) {
    console.log(`  ${vendor} → ${code}`);
  }
  console.log('');

  const {updates, skippedProducts, skippedItems} = await collectUpdates();

  console.log('');
  console.log(
    `Kandydaci do aktualizacji HS: ${updates.length} inventory item(s) (pominięto produkty: ${skippedProducts}, pozycje: ${skippedItems})`,
  );

  let updated = 0;
  let errors = 0;

  if (DRY_RUN) {
    for (const entry of updates) {
      console.log(
        `[dry-run] ${entry.productTitle} | vendor=${entry.vendor} | ${entry.from} → ${entry.to} | product=${entry.productId} | inventoryItem=${entry.inventoryItemId}`,
      );
    }
  } else {
    for (const entry of updates) {
      try {
        const result = await updateInventoryItemHs(entry);
        if (!result.ok) {
          errors += 1;
          console.error(
            `Błąd: ${entry.productTitle} | ${entry.inventoryItemId} | ${JSON.stringify(result.errors)}`,
          );
          continue;
        }
        updated += 1;
        console.log(
          `Zaktualizowano: ${entry.productTitle} | ${entry.from} → ${result.harmonizedSystemCode} | ${entry.inventoryItemId}`,
        );
      } catch (e) {
        errors += 1;
        console.error(
          `Błąd: ${entry.productTitle} | ${entry.inventoryItemId} | ${e.message || e}`,
        );
      }
    }
  }

  console.log('');
  if (DRY_RUN) {
    console.log(
      `Podsumowanie (dry-run): kandydaci=${updates.length}, pominięto produkty=${skippedProducts}, pominięto pozycje=${skippedItems}, błędy=0`,
    );
  } else {
    console.log(
      `Podsumowanie: zaktualizowano=${updated}, błędy=${errors}, pominięto produkty=${skippedProducts}, pominięto pozycje=${skippedItems}`,
    );
  }

  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
