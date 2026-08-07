#!/usr/bin/env node
/**
 * Seed campaign landing metaobjects + shop.metafields.app.campaign_mapping (KAZKA).
 *
 * Wymaga: SHOPIFY_ADMIN_TOKEN lub SHOPIFY_ADMIN_ACCESS_TOKEN
 *   SHOP lub PUBLIC_STORE_DOMAIN / SHOPIFY_SHOP_DOMAIN
 *
 * Po `shopify app deploy` i reinstalacji app (scope read_metaobjects, write_metaobjects):
 *   node scripts/seed-campaign-landings.mjs
 *
 * Opcje:
 *   --skip-invalid   pomiń brakujące product GID zamiast failować
 *   --product-limit=N  ile produktów Kazka pobrać do product_ids (domyślnie 8)
 *
 * product_ids: jeśli SEED_LANDINGS ma puste tablice, skrypt auto-pobiera GID-y
 * produktów z kolekcji/tagu kazka przez Admin API.
 */

import {existsSync, readFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const CAMPAIGN_LANDING_TYPE = '$app:campaign_landing';

const argv = process.argv.slice(2);
const SKIP_INVALID = argv.includes('--skip-invalid');
const productLimitArg = argv.find((a) => a.startsWith('--product-limit='));
const PRODUCT_LIMIT = productLimitArg
  ? Math.max(1, Number(productLimitArg.split('=')[1]) || 8)
  : 8;

const SEED_MAPPING = {
  kazka_b2b: 'b2b-landing',
  kazka_wiecznosc: 'wiecznosc-landing',
  kazka_lab_grown: 'lab-grown-landing',
  default: 'default-landing',
};

/** productIds: [] → auto-fill z katalogu Kazka (patrz fetchKazkaProductGids). */
const SEED_LANDINGS = [
  {
    handle: 'default-landing',
    heroTitle: 'EPIR Art Jewellery — Kazka',
    heroSubtitle:
      'Biżuteria tworzona w polskiej pracowni — diamenty selekcjonowane przez gemmologów.',
    productIds: [],
    ctaLabel: 'Zobacz kolekcję',
    ctaUrl: '/collections/kazka',
  },
  {
    handle: 'b2b-landing',
    heroTitle: 'KAZKA dla partnerów B2B',
    heroSubtitle: 'Ekskluzywna oferta hurtowa i współpraca z salonami jubilerskimi.',
    productIds: [],
    ctaLabel: 'Skontaktuj się',
    ctaUrl: '/pages/o-nas',
  },
  {
    handle: 'wiecznosc-landing',
    heroTitle: 'Kolekcja Wieczność',
    heroSubtitle: 'Symbolika wieczności w formie biżuterii artystycznej.',
    productIds: [],
    ctaLabel: 'Odkryj kolekcję',
    ctaUrl: '/collections/kazka',
  },
  {
    handle: 'lab-grown-landing',
    heroTitle: 'Diamenty laboratoryjne',
    heroSubtitle: 'Nowoczesna elegancja — diamenty lab-grown w polskiej pracowni.',
    productIds: [],
    ctaLabel: 'Zobacz produkty',
    ctaUrl: '/collections/kazka',
  },
];

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
  const paths = [
    join(dir, '../.dev.vars'),
    join(dir, '../apps/kazka/.dev.vars'),
    join(dir, '../workers/chat/.dev.vars'),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf8');
    const mToken =
      content.match(/SHOPIFY_ADMIN_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ADMIN_ACCESS_TOKEN\s*=\s*(.+)/) ||
      content.match(/SHOPIFY_ACCESS_TOKEN\s*=\s*(.+)/);
    const mShop = content.match(/SHOP\s*=\s*(.+)/);
    const mShopAlt = content.match(
      /(?:SHOP_DOMAIN|SHOPIFY_SHOP_DOMAIN|PUBLIC_STORE_DOMAIN)\s*=\s*(.+)/,
    );
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

if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || !process.env.SHOP) {
  const fromDev = loadFromDevVars();
  if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN && fromDev.token) {
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = fromDev.token;
  }
  if (!process.env.SHOP && fromDev.shop) {
    process.env.SHOP = fromDev.shop;
  }
}
if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN && process.env.SHOPIFY_ADMIN_TOKEN) {
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
}
if (!process.env.SHOP && process.env.SHOP_DOMAIN) {
  process.env.SHOP = normalizeShopHost(process.env.SHOP_DOMAIN);
}
if (!process.env.SHOP && process.env.PUBLIC_STORE_DOMAIN) {
  process.env.SHOP = normalizeShopHost(process.env.PUBLIC_STORE_DOMAIN);
}

const SHOP = process.env.SHOP || DEFAULT_SHOP;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

if (!TOKEN) {
  console.error(
    'Brak SHOPIFY_ADMIN_TOKEN / SHOPIFY_ADMIN_ACCESS_TOKEN (lub .dev.vars).',
  );
  process.exit(1);
}

const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

async function gql(query, variables = {}) {
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
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

const SHOP_ID_QUERY = `#graphql
  query {
    shop {
      id
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors {
        field
        message
      }
    }
  }
`;

const METAOBJECT_UPSERT = `#graphql
  mutation metaobjectUpsert($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCTS_BY_IDS = `#graphql
  query ValidateProductIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
      }
    }
  }
`;

const KAZKA_PRODUCTS_QUERY = `#graphql
  query KazkaProductsForCampaignSeed($first: Int!, $query: String!) {
    products(first: $first, query: $query) {
      nodes {
        id
        title
        handle
        status
      }
    }
  }
`;

function isProductGid(id) {
  return typeof id === 'string' && id.startsWith('gid://shopify/Product/');
}

async function validateProductGids(productIds) {
  const unique = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return {valid: [], missing: []};

  const malformed = unique.filter((id) => !isProductGid(id));
  const gids = unique.filter(isProductGid);
  if (!gids.length) return {valid: [], missing: malformed};

  const data = await gql(PRODUCTS_BY_IDS, {ids: gids});
  const found = new Set(
    (data.nodes ?? []).filter((n) => n?.id).map((n) => n.id),
  );
  return {
    valid: gids.filter((id) => found.has(id)),
    missing: [...malformed, ...gids.filter((id) => !found.has(id))],
  };
}

async function fetchKazkaProductGids(limit) {
  // Prefer products tagged/in collection kazka; fallback active products.
  const queries = [
    'collection:kazka status:active',
    'tag:kazka status:active',
    'status:active',
  ];
  for (const query of queries) {
    const data = await gql(KAZKA_PRODUCTS_QUERY, {first: limit, query});
    const nodes = (data.products?.nodes ?? []).filter((n) => n?.id);
    if (nodes.length) {
      console.log(
        `[seed-campaign-landings] auto product_ids from query="${query}" count=${nodes.length}`,
      );
      return nodes.map((n) => n.id);
    }
  }
  console.warn('[seed-campaign-landings] no products found for auto product_ids');
  return [];
}

function landingFields(landing) {
  // Handle metaobiektu to systemowy handle upsertu — nie pole (zarezerwowane w Shopify).
  const fields = [{key: 'hero_title', value: landing.heroTitle}];
  if (landing.heroSubtitle) {
    fields.push({key: 'hero_subtitle', value: landing.heroSubtitle});
  }
  if (landing.productIds?.length) {
    fields.push({key: 'product_ids', value: JSON.stringify(landing.productIds)});
  }
  if (landing.ctaLabel) {
    fields.push({key: 'cta_label', value: landing.ctaLabel});
  }
  if (landing.ctaUrl) {
    fields.push({key: 'cta_url', value: landing.ctaUrl});
  }
  return fields;
}

async function resolveProductIds(landing, autoGids) {
  const raw =
    landing.productIds?.length > 0 ? landing.productIds : autoGids;
  if (!raw.length) return [];

  const {valid, missing} = await validateProductGids(raw);
  if (missing.length) {
    const msg = `product_ids not found for ${landing.handle}: ${missing.join(', ')}`;
    if (!SKIP_INVALID) {
      throw new Error(`${msg} (użyj --skip-invalid aby kontynuować)`);
    }
    console.warn(`[seed-campaign-landings] --skip-invalid: ${msg}`);
  }
  return valid;
}

async function main() {
  console.log(
    `[seed-campaign-landings] shop=${SHOP} skipInvalid=${SKIP_INVALID} productLimit=${PRODUCT_LIMIT}`,
  );

  const {shop} = await gql(SHOP_ID_QUERY);
  const shopId = shop?.id;
  if (!shopId) {
    throw new Error('shop.id missing');
  }
  console.log(`[seed-campaign-landings] shop.id=${shopId}`);

  const needsAuto = SEED_LANDINGS.some((l) => !l.productIds?.length);
  const autoGids = needsAuto ? await fetchKazkaProductGids(PRODUCT_LIMIT) : [];

  const mappingResult = await gql(METAFIELDS_SET, {
    metafields: [
      {
        ownerId: shopId,
        namespace: 'app',
        key: 'campaign_mapping',
        type: 'json',
        value: JSON.stringify(SEED_MAPPING),
      },
    ],
  });
  const mappingErrors = mappingResult.metafieldsSet?.userErrors ?? [];
  if (mappingErrors.length) {
    throw new Error(`metafieldsSet: ${JSON.stringify(mappingErrors)}`);
  }
  console.log('[seed-campaign-landings] campaign_mapping OK', SEED_MAPPING);

  for (const landing of SEED_LANDINGS) {
    const productIds = await resolveProductIds(landing, autoGids);
    const result = await gql(METAOBJECT_UPSERT, {
      handle: {type: CAMPAIGN_LANDING_TYPE, handle: landing.handle},
      metaobject: {fields: landingFields({...landing, productIds})},
    });
    const errors = result.metaobjectUpsert?.userErrors ?? [];
    if (errors.length) {
      throw new Error(
        `metaobjectUpsert ${landing.handle}: ${JSON.stringify(errors)}`,
      );
    }
    const id = result.metaobjectUpsert?.metaobject?.id;
    console.log(
      `[seed-campaign-landings] upsert ${landing.handle} → ${id} products=${productIds.length}`,
    );
  }

  console.log('[seed-campaign-landings] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
