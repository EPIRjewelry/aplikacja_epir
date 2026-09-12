#!/usr/bin/env node
/**
 * Seed section_featured_products (featured-products-kazka) + link on route-kazka-home.
 *
 * Wymaga: SHOPIFY_ADMIN_ACCESS_TOKEN, SHOP (lub .dev.vars w root / apps/kazka)
 *   node scripts/seed-kazka-featured-products.mjs
 *   node scripts/seed-kazka-featured-products.mjs --product-limit=4
 */

import {existsSync, readFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const API_VERSION = '2026-04';
const DEFAULT_SHOP = 'epir-art-silver-jewellery.myshopify.com';
const FEATURED_HANDLE = 'featured-products-kazka';
const ROUTE_HANDLE = 'route-kazka-home';
const SECTION_TYPE = 'section_featured_products';
const ROUTE_TYPE = 'route';

const argv = process.argv.slice(2);
const productLimitArg = argv.find((a) => a.startsWith('--product-limit='));
const PRODUCT_LIMIT = productLimitArg
  ? Math.max(1, Number(productLimitArg.split('=')[1]) || 4)
  : 4;

function normalizeShopHost(raw) {
  const v = String(raw ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
  if (!v) return null;
  return v.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function loadFromDevVars() {
  const dir = dirname(fileURLToPath(import.meta.url));
  const paths = [
    join(dir, '../.dev.vars'),
    join(dir, './.dev.vars'),
    join(dir, '../apps/kazka/.dev.vars'),
    join(dir, '../apps/zareczyny/.dev.vars'),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf8');
    const mToken =
      content.match(/SHOPIFY_ADMIN_ACCESS_TOKEN\s*=\s*(.+)/) ??
      content.match(/SHOPIFY_ADMIN_TOKEN\s*=\s*(.+)/);
    const mShop =
      content.match(/SHOP\s*=\s*(.+)/) ??
      content.match(/PUBLIC_STORE_DOMAIN\s*=\s*(.+)/);
    const token = mToken
      ? mToken[1].trim().replace(/^['"]|['"]$/g, '')
      : null;
    const shop = mShop ? normalizeShopHost(mShop[1]) : null;
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
if (!process.env.SHOP && process.env.PUBLIC_STORE_DOMAIN) {
  process.env.SHOP = normalizeShopHost(process.env.PUBLIC_STORE_DOMAIN);
}

const SHOP = process.env.SHOP || DEFAULT_SHOP;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

if (!TOKEN) {
  console.error(
    'Brak SHOPIFY_ADMIN_ACCESS_TOKEN. Ustaw w .dev.vars lub env.',
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

const KAZKA_PRODUCTS_QUERY = `#graphql
  query KazkaProductsForFeatured($first: Int!, $query: String!) {
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

const METAOBJECT_BY_HANDLE = `#graphql
  query MetaobjectByHandle($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) {
      id
      handle
      type
    }
  }
`;

const METAOBJECT_UPSERT = `#graphql
  mutation metaobjectUpsert($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject {
        id
        handle
        type
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const METAOBJECT_UPDATE = `#graphql
  mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
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

async function fetchKazkaProductGids(limit) {
  const queries = [
    'collection:kazka status:active',
    'tag:kazka status:active',
    'vendor:Kazka status:active',
    'status:active',
  ];
  for (const query of queries) {
    const data = await gql(KAZKA_PRODUCTS_QUERY, {first: limit, query});
    const nodes = (data.products?.nodes ?? []).filter((n) => n?.id);
    if (nodes.length) {
      console.log(
        `[seed-kazka-featured-products] products from query="${query}" count=${nodes.length}`,
      );
      for (const n of nodes) {
        console.log(`  - ${n.handle} (${n.id})`);
      }
      return nodes.map((n) => n.id);
    }
  }
  return [];
}

async function upsertFeaturedSection(productIds) {
  const fields = [
    {key: 'heading', value: 'Wybrane'},
    {key: 'with_product_prices', value: 'true'},
    {key: 'products', value: JSON.stringify(productIds)},
  ];

  const data = await gql(METAOBJECT_UPSERT, {
    handle: {type: SECTION_TYPE, handle: FEATURED_HANDLE},
    metaobject: {fields},
  });
  const result = data.metaobjectUpsert;
  const errors = result?.userErrors ?? [];
  if (errors.length) {
    throw new Error(
      `metaobjectUpsert ${FEATURED_HANDLE}: ${JSON.stringify(errors)}`,
    );
  }
  return result.metaobject;
}

async function linkRouteFeaturedProducts(featuredGid) {
  const routeData = await gql(METAOBJECT_BY_HANDLE, {
    handle: {type: ROUTE_TYPE, handle: ROUTE_HANDLE},
  });
  const route = routeData.metaobjectByHandle;
  if (!route?.id) {
    throw new Error(`Brak metaobiektu route: ${ROUTE_HANDLE}`);
  }

  const data = await gql(METAOBJECT_UPDATE, {
    id: route.id,
    metaobject: {
      fields: [
        {
          key: 'featured_products',
          value: JSON.stringify([featuredGid]),
        },
      ],
    },
  });
  const errors = data.metaobjectUpdate?.userErrors ?? [];
  if (errors.length) {
    throw new Error(
      `metaobjectUpdate ${ROUTE_HANDLE}: ${JSON.stringify(errors)}`,
    );
  }
  return route.id;
}

async function main() {
  console.log(`[seed-kazka-featured-products] shop=${SHOP}`);

  const productIds = await fetchKazkaProductGids(PRODUCT_LIMIT);
  if (!productIds.length) {
    throw new Error('Nie znaleziono produktów Kazka do featured_products.');
  }

  const featured = await upsertFeaturedSection(productIds);
  console.log(
    `[seed-kazka-featured-products] upsert ${featured.handle} → ${featured.id}`,
  );

  const routeId = await linkRouteFeaturedProducts(featured.id);
  console.log(
    `[seed-kazka-featured-products] route ${ROUTE_HANDLE} (${routeId}) → featured_products=[${featured.id}]`,
  );
  console.log('[seed-kazka-featured-products] done');
}

main().catch((err) => {
  console.error('[seed-kazka-featured-products] FAIL:', err.message);
  process.exit(1);
});
